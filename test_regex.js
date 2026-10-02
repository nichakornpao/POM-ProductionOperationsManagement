const items = ['PBQ0005N', 'PBQ0005', 'PBQ0005AR', 'TOOL123', 'A123B'];
items.forEach(it => {
    const match = it.match(/^(.*?[0-9]+)/);
    console.log(it, '->', match ? match[1] : it);
});
