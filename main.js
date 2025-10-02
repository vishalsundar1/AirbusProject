function doGet() {
    return HtmlService.createHtmlOutputFromFile("index")
        .setTitle("Knowledge Assistant")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/******************************
 * Main entrypoint
 ******************************/
function askBot(query) {
    console.log("askBot called with query: " + query);
    var results = searchKnowledge(query);
    console.log("results: " + JSON.stringify(results));
    if (results.length === 0) return "No results found.";
    return results.map(r =>
        "<b>" + r.name + "</b><br>" +
        "<a href='" + r.url + "' target='_blank'>" + r.url + "</a><br>" +
        (r.snippet || "")
    ).join("<hr>");
}

/******************************
 * Hybrid Search Logic (Mappings + KB Index)
 ******************************/
function searchKnowledge(query) {
    // 🔹 Expand query using prompt mapping
    var expandedQueries = [query].concat(expandQueryWithMappings(query));

    var results = [];
    var seen = {};

    expandedQueries.forEach(function (q) {
        var matches = searchKB(q);   // <-- now reads from kbIndex JSON
        matches.forEach(function (m) {
            if (!seen[m.id]) {
                results.push({
                    name: m.name,
                    url: m.url,
                    snippet: m.snippet || ""
                });
                seen[m.id] = true;
            }
        });
    });

    return results.slice(0, 5); // top 5
}

/******************************
 * Fuzzy string similarity
 * (kept in case you want fuzzy search later)
 ******************************/
function similarity(s1, s2) {
    var longer = s1.length > s2.length ? s1 : s2;
    var shorter = s1.length > s2.length ? s2 : s1;
    var longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function editDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    var costs = [];
    for (var i = 0; i <= s1.length; i++) {
        var lastValue = i;
        for (var j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else {
                if (j > 0) {
                    var newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}


/**
 * Returns all KB titles (for debug/helper)
 */
function getAllKBTitles() {
    var payload = getKBIndexPayload();
    if (!payload || !payload.index) return [];

    var titles = [];
    for (var normalizedTitle in payload.index) {
        payload.index[normalizedTitle].forEach(function (e) {
            titles.push(e.name);
        });
    }

    return titles;
}
