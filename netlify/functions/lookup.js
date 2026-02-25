export default async (req, context) => {
  const url = new URL(req.url);
  const source = url.searchParams.get("source");
  const est = url.searchParams.get("est") || "";
  const prefix = url.searchParams.get("prefix") || "M";
  const cc = url.searchParams.get("cc") || "";
  const num = url.searchParams.get("num") || "";
  const sfx = url.searchParams.get("sfx") || "";

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    if (source === "fsis") {
      // FSIS publishes a weekly CSV — fetch and search it
      const csvUrl = "https://www.fsis.usda.gov/sites/default/files/media_file/documents/MPI_Directory_by_Establishment_Number.csv";
      const r = await fetch(csvUrl, {
        headers: { "User-Agent": "FoodEstablishmentFinder/1.0" }
      });

      if (!r.ok) {
        return new Response(JSON.stringify({ found: false, error: `CSV fetch failed: ${r.status}` }), { headers });
      }

      const csv = await r.text();
      const lines = csv.split("\n");
      const headerLine = lines[0].split(",").map(h => h.trim().replace(/"/g, "").toLowerCase());

      const idIdx    = headerLine.findIndex(h => h.includes("establishment_id") || h === "id");
      const nameIdx  = headerLine.findIndex(h => h.includes("establishment_name") || h.includes("name"));
      const addrIdx  = headerLine.findIndex(h => h.includes("address"));
      const cityIdx  = headerLine.findIndex(h => h.includes("city"));
      const stateIdx = headerLine.findIndex(h => h.includes("state"));
      const actIdx   = headerLine.findIndex(h => h.includes("activities") || h.includes("activity"));

      const searchTerms = [
        `${prefix}${est}`.toUpperCase(),
        est.toUpperCase(),
      ];

      for (const line of lines.slice(1)) {
        if (!line.trim()) continue;
        const cols = parseCSVLine(line);
        const rowId = (cols[idIdx] || "").replace(/"/g, "").trim().toUpperCase();

        if (searchTerms.some(t => rowId === t || rowId.endsWith(est))) {
          return new Response(JSON.stringify({
            found: true,
            data: {
              establishment_name: (cols[nameIdx] || "").replace(/"/g, "").trim() || null,
              address: (cols[addrIdx] || "").replace(/"/g, "").trim() || null,
              city: (cols[cityIdx] || "").replace(/"/g, "").trim() || null,
              state: (cols[stateIdx] || "").replace(/"/g, "").trim() || null,
              activities: (cols[actIdx] || "").replace(/"/g, "").trim() || null,
              establishment_id: rowId,
            }
          }), { headers });
        }
      }

      // Debug: return header info so we can see what columns exist
      return new Response(JSON.stringify({
        found: false,
        searched: searchTerms,
        total_rows: lines.length,
        headers: headerLine,
        sample: lines[1]
      }), { headers });

    } else if (source === "fsis_recall") {
      const recallUrl = `https://www.fsis.usda.gov/fsis/api/recall/v/1?establishment_id=${prefix}${est}&$top=3`;
      const r = await fetch(recallUrl, { headers: { "Accept": "application/json" } });
      if (!r.ok) return new Response(JSON.stringify({ found: false }), { headers });
      const data = await r.json();
      return new Response(JSON.stringify({ found: true, data }), { headers });

    } else if (source === "fda") {
      const fdaUrl = `https://api.fda.gov/food/facility.json?search=registration_number:${est}&limit=1`;
      const r = await fetch(fdaUrl);
      if (!r.ok) return new Response(JSON.stringify({ found: false }), { headers });
      const data = await r.json();
      return new Response(JSON.stringify({ found: true, data }), { headers });

    } else if (source === "off") {
      const variants = [
        `https://world.openfoodfacts.org/packager-code/${cc}${num}${sfx}.json`,
        `https://world.openfoodfacts.org/packager-code/${cc}-${num}-${sfx}.json`,
      ];
      for (const v of variants) {
        const r = await fetch(v);
        if (r.ok) {
          const d = await r.json();
          if (d?.packager_code?.name) {
            return new Response(JSON.stringify({ found: true, name: d.packager_code.name, city: d.packager_code.city || null }), { headers });
          }
        }
      }
      return new Response(JSON.stringify({ found: false }), { headers });

    } else {
      return new Response(JSON.stringify({ error: "Unknown source" }), { status: 400, headers });
    }

  } catch (err) {
    return new Response(JSON.stringify({ found: false, error: err.message }), { headers });
  }
};

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export const config = {
  path: "/api/lookup",
};
