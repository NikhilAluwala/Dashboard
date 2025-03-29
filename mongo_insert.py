from pymongo import MongoClient
import pandas as pd

# MongoDB connection string
mongo_uri = "mongodb://admin:admin@192.168.56.10:27017/?authSource=admin"

# Database and collection names
db_name = "mydatabase"
collection_name = "models"

# Connect to MongoDB
client = MongoClient(mongo_uri)
db = client[db_name]
collection = db[collection_name]

# Load Excel file
df = pd.read_excel("model_data.xlsx")

# Convert to JSON format
json_data = df.to_dict(orient="records")

# Insert data into MongoDB
collection.insert_many(json_data)

print("Data inserted successfully!")
