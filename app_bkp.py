from flask import Flask, jsonify, request, render_template
from pymongo import MongoClient
import pandas as pd
import threading
import time
from datetime import datetime
import os
import logging
import numpy as np

# Basic logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# MongoDB Connection
mongo_uri = "mongodb://admin:admin@192.168.56.10:27017/?authSource=admin"
client = MongoClient(mongo_uri)
db = client["mydatabase"]
collection = db["models"]

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
            
            logger.info("Cache refreshed successfully")
        except Exception as e:
            logger.error(f"Cache refresh failed: {e}")

    def _start_refresh_thread(self):
        def check_and_refresh():
            while True:
                try:
                    current_mtime = os.path.getmtime(self.excel_file)
                    if current_mtime != self.last_modified:
                        logger.info("File changed, refreshing cache")
                        self.refresh_cache()
                except Exception as e:
                    logger.error(f"Refresh thread error: {e}")
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
        data = list(collection.find({}, {"_id": 0}))  # Exclude ObjectId
        return jsonify(data)
    except Exception as e:
        logger.error(f"MongoDB fetch error: {e}")
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

@app.route('/api/cache-status')
def get_cache_status():
    return jsonify({
        'last_update': cache.last_update.strftime('%Y-%m-%d %H:%M:%S') if cache.last_update else 'Never',
        'file_path': cache.excel_file
    })

@app.route('/')
def home():
    return render_template('new.html')

if __name__ == '__main__':
    app.run(debug=True,port=5550)
