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
      // Scrape the FSIS inspected establishments search page
      const searchUrl = `https://www.fsis.usda.gov/inspection/fsis-inspected-establishments?field_establishment_name_value=&field_establishment_number_value=${prefix}${num || est}&field_activities_target_id=All&field_size_target_id=All&field_state_target_id=All`;
      const r = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
        }
      });

      if (!r.ok) {
        return new Response(JSON.stringify({ found: false, error: `Search page failed: ${r.status}` }), { headers });
      }

      const html = await r.text();

      // Parse establishment name and details from the HTML table
      const nameMatch = html.match(/class="views-field views-field-field-establishment-name"[^>]*>\s*<span[^>]*>\s*([^<]+)/i);
      const addrMatch = html.match(/class="views-field views-field-field-address"[^>]*>\s*<span[^>]*>\s*([^<]+)/i);
      const cityMatch = html.match(/class="views-field views-field-field-city"[^>]*>\s*<span[^>]*>\s*([^<]+)/i);
      const stateMatch = html.match(/class="views-field views-field-field-state"[^>]*>\s*<span[^>]*>\s*([^<]+)/i);
      const activitiesMatch = html.match(/class="views-field views-field-field-activities"[^>]*>\s*<span[^>]*>\s*([^<]+)/i);

      const name = nameMatch?.[1]?.trim();

      if (name) {
        return new Response(JSON.stringify({
          found: true,
          data: {
            establishment_name: name,
            address: addrMatch?.[1]?.trim() || null,
            city: cityMatch?.[1]?.trim() || null,
            state: stateMatch?.[1]?.trim() || null,
            activities: activitiesMatch?.[1]?.trim() || null,
          }
        }), { headers });
      }

      // Return debug info if not found
      const hasResults = html.includes("views-row") && !html.includes("no results");
      return new Response(JSON.stringify({
        found: false,
        has_results_section: hasResults,
        html_snippet: html.slice(html.indexOf("views-field-field-establishment"), html.indexOf("views-field-field-establishment") + 500).replace(/<[^>]+>/g, " ").trim().slice(0, 300),
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

export const config = {
  path: "/api/lookup",
};
