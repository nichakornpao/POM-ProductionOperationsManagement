const fs = require('fs');
const zlib = require('zlib');

const filePath = String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts\Process DWG\OT-7070\T7070-G1CT01.pdf`;

try {
    if (!fs.existsSync(filePath)) {
        console.log('File not found:', filePath);
        process.exit(1);
    }

    const buf = fs.readFileSync(filePath);
    console.log('File size:', buf.length, 'bytes');

    // Extract all streams
    let textChunks = [];
    let pos = 0;
    while (pos < buf.length) {
        const streamStart = buf.indexOf('stream', pos);
        if (streamStart === -1) break;
        
        let dataStart = streamStart + 6;
        if (buf[dataStart] === 0x0d && buf[dataStart + 1] === 0x0a) dataStart += 2;
        else if (buf[dataStart] === 0x0a || buf[dataStart] === 0x0d) dataStart += 1;

        const streamEnd = buf.indexOf('endstream', dataStart);
        if (streamEnd === -1) break;

        const streamData = buf.subarray(dataStart, streamEnd);
        try {
            const decompressed = zlib.inflateSync(streamData);
            const str = decompressed.toString('utf8');
            textChunks.push(str);
        } catch (_) {
            // maybe uncompressed or different filter
            const str = streamData.toString('utf8');
            if (str.includes('BT') || str.includes('Tf') || str.includes('Tj')) {
                textChunks.push(str);
            }
        }

        pos = streamEnd + 9;
    }

    const fullText = textChunks.join('\n');
    console.log('Extracted streams count:', textChunks.length);

    // Find all text inside ( ... ) Tj or [ ... ] TJ
    const tjRegex = /\(([^)]+)\)\s*Tj/g;
    let match;
    let extractedWords = [];
    while ((match = tjRegex.exec(fullText)) !== null) {
        extractedWords.push(match[1]);
    }

    // Also TJ array regex
    const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
    while ((match = tjArrayRegex.exec(fullText)) !== null) {
        const inner = match[1];
        const innerParts = inner.match(/\(([^)]+)\)/g) || [];
        extractedWords.push(innerParts.map(p => p.slice(1, -1)).join(''));
    }

    console.log('Total text elements found:', extractedWords.length);
    console.log('Extracted words sample:');
    console.log(extractedWords.slice(0, 100));

    // Search for REV or REVISION
    const revMatches = extractedWords.filter(w => /rev/i.test(w) || /edition/i.test(w) || /version/i.test(w));
    console.log('Matches with REV:', revMatches);

    // Let's print all words around "REV"
    for (let i = 0; i < extractedWords.length; i++) {
        if (/rev/i.test(extractedWords[i])) {
            console.log(`Context around word ${i} [${extractedWords[i]}]:`, extractedWords.slice(Math.max(0, i - 5), i + 6));
        }
    }

} catch (e) {
    console.error('Error:', e.message);
}
