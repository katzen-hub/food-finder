import { readFile } from "fs/promises";
import { join } from "path";

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
      // Load the bundled FSIS JSON lookup table
      const jsonPath = join(process.cwd(), "fsis.json");
      const raw = await readFile(jsonPath, "utf-8");
      const db = JSON.parse(raw);

      // Try prefix+number (e.g. M969), then just number
      const keys = [`${prefix}${est}`.toUpperCase(), est.toUpperCase()];
      let entry = null;
      for (const key of keys) {
        if (db[key]) { entry = db[key]; break; }
      }

      if (entry) {
        return new Response(JSON.stringify({
          found: true,
          data: {
            establishment_name: entry.n,
            address: entry.a,
            city: entry.c,
            state: entry.s,
            activities: entry.t,
          }
        }), { headers });
      }
      return new Response(JSON.stringify({ found: false }), { headers });

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

export const config = {
  path: "/api/lookup",
};
