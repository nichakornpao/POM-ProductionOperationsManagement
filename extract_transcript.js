const fs = require('fs');
const readline = require('readline');

async function processTranscript() {
    const fileStream = fs.createReadStream('C:\\Users\\bpp9596\\.gemini\\antigravity-ide\\brain\\961972f1-edac-497a-aafd-4e3a47b28c29\\.system_generated\\logs\\transcript_full.jsonl');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let tsContent = '';
    let htmlContent = '';

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            
            // Check if it's a tool response for view_file
            if (data.type === 'TOOL_RESPONSE' && data.tool_calls && data.tool_calls.length > 0) {
                // Actually, wait, view_file output is in data.content? No, tool_response content is usually a JSON or string.
                // It's easier to check if the agent read the file or replaced the file.
            }

            // Check if it's a tool call
            if (data.type === 'PLANNER_RESPONSE' && data.tool_calls) {
                for (const call of data.tool_calls) {
                    if (call.name.includes('replace_file_content') || call.name.includes('write_to_file')) {
                        const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
                        if (args.TargetFile && args.TargetFile.includes('engineer-history.component.ts')) {
                            // tsContent = JSON.stringify(args);
                        }
                    }
                }
            }
        } catch (e) {}
    }
}

// Just search for the last view_file output for these files
async function findLastViewFile() {
    const fileStream = fs.createReadStream('C:\\Users\\bpp9596\\.gemini\\antigravity-ide\\brain\\961972f1-edac-497a-aafd-4e3a47b28c29\\.system_generated\\logs\\transcript_full.jsonl');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let latestHtml = '';
    let latestTs = '';

    for await (const line of rl) {
        if (line.includes('engineer-history.component.html')) {
            latestHtml = line;
        }
        if (line.includes('engineer-history.component.ts')) {
            latestTs = line;
        }
    }
    
    fs.writeFileSync('last_html_log.txt', latestHtml);
    fs.writeFileSync('last_ts_log.txt', latestTs);
}

findLastViewFile();
