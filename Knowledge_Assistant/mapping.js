/******************************
 * Prompt → File Title Mapping
 ******************************/
var SEARCH_MAPPINGS = {
    // Example mappings
    "how to reset password": [
        "Password Reset Instructions",]
};

/**
 * Helper to expand query with mapped file titles
 */
function expandQueryWithMappings(query) {
    var normalized = query.trim().toLowerCase();
    var expansions = [];

    for (var key in SEARCH_MAPPINGS) {
        if (SEARCH_MAPPINGS.hasOwnProperty(key)) {
            if (normalized === key.toLowerCase()) {
                expansions = expansions.concat(SEARCH_MAPPINGS[key]);
            }
        }
    }

    return expansions;
}

/******************************
 * KB Title Index (JSON)
 ******************************/
var KB_ROOT_FOLDER_ID = "YOUR_ROOT_FOLDER_ID"; // <-- set your KB root folder ID here

function refreshKBIndex(includeSnippets) {
    includeSnippets = !!includeSnippets;

    if (!KB_ROOT_FOLDER_ID || KB_ROOT_FOLDER_ID === "YOUR_ROOT_FOLDER_ID") {
        throw new Error("Please set KB_ROOT_FOLDER_ID to your KB root folder ID.");
    }

    var index = buildTitleIndex(KB_ROOT_FOLDER_ID, includeSnippets);

    var payload = {
        ts: Date.now(),
        rootId: KB_ROOT_FOLDER_ID,
        index: index
    };

    PropertiesService.getScriptProperties().setProperty("kbIndex_v1", JSON.stringify(payload));
    Logger.log("KB index refreshed: " + Object.keys(index).length + " unique titles. Snippets included: " + includeSnippets);
}

/**
 * Build the title index by scanning folder tree (BFS)
 */
function buildTitleIndex(rootFolderId, includeSnippets) {
    var queue = [rootFolderId];
    var index = {};
    var visitedFolders = {};

    while (queue.length > 0) {
        var currentFolderId = queue.shift();
        if (visitedFolders[currentFolderId]) continue;
        visitedFolders[currentFolderId] = true;

        var folder;
        try { folder = DriveApp.getFolderById(currentFolderId); }
        catch (e) { Logger.log("Cannot open folder " + currentFolderId + ": " + e); continue; }

        // Index files
        var files = folder.getFiles();
        while (files.hasNext()) {
            var file = files.next();
            if (file.getMimeType() !== MimeType.GOOGLE_DOCS) continue;

            var title = file.getName();
            var normalized = normalizeTitle(title);

            var entry = {
                id: file.getId(),
                name: title,
                url: makeSafeDriveUrl(file.getId()),
                lastUpdated: file.getLastUpdated() ? file.getLastUpdated().getTime() : null,
                snippet: ""
            };

            if (includeSnippets) {
                try {
                    var paras = DocumentApp.openById(file.getId()).getBody().getParagraphs();
                    var snippetParts = [];
                    for (var i = 0; i < paras.length && i < 3; i++) {
                        var t = paras[i].getText();
                        if (t && t.trim().length > 0) snippetParts.push(t.trim());
                    }
                    entry.snippet = snippetParts.join("\n").slice(0, 800);
                } catch (err) {
                    entry.snippet = "";
                }
            }

            if (!index[normalized]) index[normalized] = [];
            index[normalized].push(entry);
        }

        // Queue subfolders
        var subfolders = folder.getFolders();
        while (subfolders.hasNext()) queue.push(subfolders.next().getId());
    }

    return index;
}

/**
 * Normalize a title for the index key
 */
function normalizeTitle(title) {
    return (title || "").toString().toLowerCase().trim()
        .replace(/\s+/g, " ")
        .replace(/[^\w\s\-]/g, "");
}

/**
 * Get parsed KB index from Script Properties
 */
function getKBIndexPayload() {
    var raw = PropertiesService.getScriptProperties().getProperty("kbIndex_v1");
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (e) { Logger.log("Failed to parse kbIndex_v1: " + e); return null; }
}

/**
 * Search KB index by title substring
 */
function searchKB(query, limit) {
    limit = limit || 5;
    var payload = getKBIndexPayload();
    if (!payload || !payload.index) return [];

    var index = payload.index;
    var q = (query || "").toLowerCase().trim();
    if (!q) return [];

    var results = [];
    var seen = {};

    // Exact matches first
    if (index[q]) index[q].forEach(e => { if (!seen[e.id]) { results.push(e); seen[e.id] = true; } });

    // Then substring matches
    for (var normalizedTitle in index) {
        if (results.length >= limit) break;
        if (normalizedTitle.indexOf(q) > -1) {
            index[normalizedTitle].forEach(e => {
                if (results.length < limit && !seen[e.id]) { results.push(e); seen[e.id] = true; }
            });
        }
    }

    return results.slice(0, limit);
}

/**
 * Generates a safe Google Docs URL
 */
function makeSafeDriveUrl(fileId) {
    return "https://docs.google.com/document/d/" + fileId + "/edit";
}
