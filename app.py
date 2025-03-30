from flask import Flask, jsonify, request, render_template
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
import pandas as pd
import threading
import time
from datetime import datetime
import os
import numpy as np
import atexit


app = Flask(__name__)

class MongoDBConnection:
    def __init__(self, uri, db_name, max_pool_size=20, min_pool_size=5, timeout=30000):
        self.uri = uri
        self.db_name = db_name
        self.client = None
        self.db = None
        self.max_pool_size = max_pool_size
        self.min_pool_size = min_pool_size
        self.timeout = timeout
        self.connect()
    
    def connect(self):
        try:
            # Configure for read-only operations with optimized pool size
            self.client = MongoClient(
                self.uri,
                maxPoolSize=self.max_pool_size,
                minPoolSize=self.min_pool_size,
                connectTimeoutMS=self.timeout,
                serverSelectionTimeoutMS=self.timeout,
                waitQueueTimeoutMS=self.timeout,
                # Lower pool size since only read operations
                readPreference='secondaryPreferred'  # Prefer reading from secondary nodes if available
            )
            # Test the connection
            self.client.admin.command('ping')
            self.db = self.client[self.db_name]
            print("MongoDB connection established successfully")
        except (ConnectionFailure, ServerSelectionTimeoutError) as e:
            print(f"MongoDB connection failed: {e}")
            raise
    
    def get_collection(self, collection_name):
        if self.db is None:
            self.connect()
        return self.db[collection_name]
    
    def close(self):
        if self.client:
            self.client.close()
            print("MongoDB connection closed")

# Initialize MongoDB connection - smaller pool size for read-only dashboard
mongo_uri = "mongodb://admin:admin@192.168.56.10:27017/?authSource=admin"
mongodb = MongoDBConnection(mongo_uri, "mydatabase", max_pool_size=20, min_pool_size=5)

# Register close function to be called on application shutdown
def close_mongo_connection():
    mongodb.close()

atexit.register(close_mongo_connection)

class DataCache:
    def __init__(self, excel_file='data.xlsx', check_interval=10):
        self.excel_file = excel_file
        self.check_interval = check_interval
        self.cache = {}
        self.last_update = None
        self.last_modified = None
        self.lock = threading.Lock()
        
        # Initial load and start background refresh
        self.refresh_cache()
        self._start_refresh_thread()

    def refresh_cache(self):
        try:
            xls = pd.ExcelFile(self.excel_file, engine='openpyxl')
            sheet_names = xls.sheet_names
            
            new_cache = {}
            for sheet_name in sheet_names:
                df = pd.read_excel(self.excel_file, sheet_name=sheet_name)
                if not df.empty:
                    df.columns = df.columns.str.strip()
                    df = df.replace({np.nan: None})
                    new_cache[sheet_name.strip()] = df.to_dict('records')
            
            with self.lock:
                self.cache = new_cache
                self.last_update = datetime.now()
                self.last_modified = os.path.getmtime(self.excel_file)
            
            print("Cache refreshed successfully")
        except Exception as e:
           print(f"Cache refresh failed: {e}")

    def _start_refresh_thread(self):
        def check_and_refresh():
            while True:
                try:
                    current_mtime = os.path.getmtime(self.excel_file)
                    if current_mtime != self.last_modified:
                        print("File changed, refreshing cache")
                        self.refresh_cache()
                except Exception as e:
                    print(f"Refresh thread error: {e}")
                finally:
                    time.sleep(self.check_interval)
        
        thread = threading.Thread(target=check_and_refresh, daemon=True)
        thread.start()

    def get_data(self, sheet=None):
        with self.lock:
            if sheet:
                return self.cache.get(sheet, [])
            return self.cache

# Initialize cache for Excel data
cache = DataCache()

@app.route('/api/current-data')
def get_current_data():
    try:
        collection = mongodb.get_collection("models")
        # For read-only operations, we can use a cursor more efficiently
        cursor = collection.find({}, {"_id": 0})
        data = list(cursor)
        return jsonify(data)
    except Exception as e:
        print(f"MongoDB fetch error: {e}")
        return jsonify({'error': 'Failed to fetch data from MongoDB'}), 500

# API endpoints
@app.route('/api/summary')
def get_summary():
    cadence = request.args.get('cadence')
    data = cache.get_data('Summary')
    
    if cadence:
        data = [row for row in data if row.get('Run_Cadence', '').lower() == cadence.lower()]
    
    return jsonify(data)

@app.route('/api/usecase/<usecase_name>')
def get_usecase(usecase_name):
    data = cache.get_data(usecase_name.strip())
    if not data:
        return jsonify({'error': 'Use case not found'}), 404
    return jsonify(data)


@app.route('/')
def home():
    return render_template('new.html')

if __name__ == '__main__':
    try:
        app.run(host='0.0.0.0', port=5550)
    finally:
        # Ensure connections are closed when app shuts down
        close_mongo_connection()
