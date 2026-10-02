const fs = require('fs');
const readline = require('readline');

async function processTranscript() {
    const fileStream = fs.createReadStream('C:\\Users\\bpp9596\\.gemini\\antigravity-ide\\brain\\961972f1-edac-497a-aafd-4e3a47b28c29\\.system_generated\\logs\\transcript_full.jsonl');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let patches = [];

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            
            if (data.type === 'PLANNER_RESPONSE' && data.tool_calls) {
                for (const call of data.tool_calls) {
                    if (call.name === 'default_api:multi_replace_file_content' || call.name === 'default_api:replace_file_content') {
                        const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
                        if (args.TargetFile && args.TargetFile.includes('engineer-history.component.html')) {
                            patches.push({
                                type: call.name,
                                args: args
                            });
                        }
                    }
                }
            }
        } catch (e) {}
    }
    
    fs.writeFileSync('patches_html.json', JSON.stringify(patches, null, 2));
    console.log(`Extracted ${patches.length} patches.`);
}

processTranscript();
