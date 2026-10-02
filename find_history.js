const fs = require('fs');
const path = require('path');
const os = require('os');

function searchHistory(dir, keyword) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            searchHistory(fullPath, keyword);
        } else if (stat.isFile()) {
            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                if (content.includes(keyword)) {
                    console.log(`Found in: ${fullPath}`);
                    fs.copyFileSync(fullPath, 'found_' + path.basename(dir) + '_' + file + '.txt');
                }
            } catch (e) {}
        }
    }
}

const historyPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'History');
searchHistory(historyPath, 'planListEnData');
