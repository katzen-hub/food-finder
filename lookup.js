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
    let apiUrl = "";

    if (source === "fsis") {
      // Try multiple known FSIS API URL formats
      const fsisUrls = [
        `https://www.fsis.usda.gov/fsis/api/establishment/v/1?establishment_number=${prefix}${est}&$top=1`,
        `https://www.fsis.usda.gov/fsis/api/establishment/v/1?EstablishmentNumber=${prefix}${est}&$top=1`,
        `https://www.fsis.usda.gov/fsis/api/mpi/v/1?establishment_number=${prefix}${est}&$top=1`,
      ];
      for (const u of fsisUrls) {
        try {
          const r = await fetch(u, { headers: { "Accept": "application/json", "User-Agent": "FoodEstablishmentFinder/1.0" } });
          const text = await r.text();
          console.log(`FSIS ${u} → ${r.status}: ${text.slice(0, 300)}`);
          if (r.ok && text.includes('{')) {
            const data = JSON.parse(text);
            return new Response(JSON.stringify({ found: true, data, url: u }), { headers });
          }
        } catch(e) { console.log(`FSIS error ${u}: ${e.message}`); }
      }
      return new Response(JSON.stringify({ found: false, tried: fsisUrls }), { headers });
    } else if (source === "fsis_recall") {
      apiUrl = `https://www.fsis.usda.gov/fsis/api/recall/v/1?establishment_id=${prefix}${est}&$top=3&$orderby=recall_date%20desc`;
    } else if (source === "fda") {
      apiUrl = `https://api.fda.gov/food/facility.json?search=registration_number:${est}&limit=1`;
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

    const r = await fetch(apiUrl, {
      headers: { "Accept": "application/json", "User-Agent": "FoodEstablishmentFinder/1.0" }
    });

    if (!r.ok) {
      return new Response(JSON.stringify({ found: false, status: r.status }), { headers });
    }

    const data = await r.json();
    return new Response(JSON.stringify({ found: true, data }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({ found: false, error: err.message }), { headers });
  }
};

export const config = {
  path: "/api/lookup",
};
