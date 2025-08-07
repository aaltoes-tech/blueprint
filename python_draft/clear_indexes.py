import os
import json
import logging
from dotenv import load_dotenv
from pinecone import Pinecone as PineconeClient

# Load environment variables
load_dotenv()

# Configuration
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_ENV = os.getenv("PINECONE_ENV", "us-east-1-aws")
INDEX_SUMMARY = "my-doc-summaries"
INDEX_CHUNKS = "my-doc-chunks"
BACKUP_FILE = "summaries_backup.json"

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

def clear_pinecone_index(client: PineconeClient, index_name: str):
    """Clear all vectors from a Pinecone index"""
    try:
        if index_name in client.list_indexes().names():
            logger.info(f"Clearing index: {index_name}")
            index = client.Index(index_name)
            
            # Delete all vectors by deleting the entire namespace
            # This is more efficient than deleting individual vectors
            index.delete(delete_all=True)
            
            logger.info(f"✓ Cleared all vectors from {index_name}")
        else:
            logger.warning(f"Index {index_name} does not exist")
    except Exception as e:
        logger.error(f"Failed to clear index {index_name}: {e}")
        raise

def get_index_stats(client: PineconeClient, index_name: str):
    """Get statistics about an index"""
    try:
        if index_name in client.list_indexes().names():
            index = client.Index(index_name)
            stats = index.describe_index_stats()
            return stats
        else:
            return None
    except Exception as e:
        logger.error(f"Failed to get stats for {index_name}: {e}")
        return None

def main():
    """Main function to clear indexes and reset system"""
    logger.info("=" * 60)
    logger.info("CLEARING PINECONE INDEXES AND RESETTING SYSTEM")
    logger.info("=" * 60)
    
    # Check environment variables
    if not PINECONE_API_KEY:
        logger.error("PINECONE_API_KEY not found in environment variables")
        return False
    
    try:
        # Initialize Pinecone client
        client = PineconeClient(api_key=PINECONE_API_KEY)
        
        # Show current stats before clearing
        logger.info("Current index statistics:")
        for index_name in [INDEX_SUMMARY, INDEX_CHUNKS]:
            stats = get_index_stats(client, index_name)
            if stats:
                vector_count = stats.get('total_vector_count', 0)
                logger.info(f"  {index_name}: {vector_count} vectors")
            else:
                logger.info(f"  {index_name}: does not exist")
        
        # Ask for confirmation
        print("\n" + "="*60)
        print("⚠️  WARNING: This will delete ALL data from your Pinecone indexes!")
        print(f"   - {INDEX_SUMMARY}")
        print(f"   - {INDEX_CHUNKS}")
        print(f"   - Backup file: {BACKUP_FILE}")
        print("="*60)
        
        response = input("Are you sure you want to continue? Type 'YES' to confirm: ")
        if response != "YES":
            logger.info("Operation cancelled by user")
            return False
        
        # Clear indexes
        logger.info("\nClearing Pinecone indexes...")
        clear_pinecone_index(client, INDEX_SUMMARY)
        clear_pinecone_index(client, INDEX_CHUNKS)
        
        # Show final stats
        logger.info("\nFinal index statistics:")
        for index_name in [INDEX_SUMMARY, INDEX_CHUNKS]:
            stats = get_index_stats(client, index_name)
            if stats:
                vector_count = stats.get('total_vector_count', 0)
                logger.info(f"  {index_name}: {vector_count} vectors")
        
        logger.info("\n" + "="*60)
        logger.info("✅ SUCCESSFULLY CLEARED ALL INDEXES AND RESET SYSTEM")
        logger.info("="*60)
        logger.info("\nYou can now run the document indexing script to start fresh:")
        logger.info("  python documents_indexing_fixed.py")
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to clear indexes: {e}")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)