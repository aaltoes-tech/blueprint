const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Simple CSV parser that handles quoted fields
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current); // Add the last field
  return result;
}

async function importCsvData() {
  try {
    console.log('Starting CSV data import...');

    // Read the CSV file
    const csvPath = path.join(__dirname, '../python_draft/files_index.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    
    // Parse CSV
    const lines = csvContent.trim().split('\n');
    const headers = parseCsvLine(lines[0]);
    
    console.log(`Found ${lines.length - 1} records to process`);
    
    // Find column indices
    const idIndex = headers.indexOf('id');
    const nameIndex = headers.indexOf('name');
    const mimeTypeIndex = headers.indexOf('mimeType');
    const parentsIndex = headers.indexOf('parents');
    const trashedIndex = headers.indexOf('trashed');
    const createdAtIndex = headers.indexOf('created_at');
    const modifiedAtIndex = headers.indexOf('modified_at');
    const urlIndex = headers.indexOf('url');
    const ownersIndex = headers.indexOf('owners');
    const yearIndex = headers.indexOf('year');

    console.log('Column indices:', {
      id: idIndex,
      name: nameIndex,
      mimeType: mimeTypeIndex,
      parents: parentsIndex,
      trashed: trashedIndex,
      created_at: createdAtIndex,
      modified_at: modifiedAtIndex,
      url: urlIndex,
      owners: ownersIndex,
      year: yearIndex
    });

    let successCount = 0;
    let errorCount = 0;

    // Process each row (skip header)
    for (let i = 1; i < lines.length; i++) {
      try {
        // Better CSV parsing to handle quoted fields
        const row = parseCsvLine(lines[i]);
        
        if (row.length < headers.length) {
          console.log(`Skipping row ${i}: insufficient columns`);
          continue;
        }

        const docId = row[idIndex]?.trim();
        const year = row[yearIndex]?.trim();

        if (!docId) {
          console.log(`Skipping row ${i}: missing doc_id`);
          errorCount++;
          continue;
        }

        // Create or update the document feedback record
        await prisma.documentFeedback.upsert({
          where: { doc_id: docId },
          update: {
            year: year || null,
            useful: true,  // Default to true
            private: false // Default to false
          },
          create: {
            doc_id: docId,
            year: year || null,
            useful: true,  // Default to true
            private: false // Default to false
          }
        });

        successCount++;
        
        if (successCount % 100 === 0) {
          console.log(`Processed ${successCount} records...`);
        }

      } catch (error) {
        console.error(`Error processing row ${i}:`, error.message);
        errorCount++;
      }
    }

    console.log(`Import completed:`);
    console.log(`- Successfully imported: ${successCount} records`);
    console.log(`- Errors: ${errorCount} records`);

  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importCsvData();