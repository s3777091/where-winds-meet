import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SOURCE_BASE = "https://wherewindsmeetcalculator.com";
const SOURCE_CHESTS_URL = `${SOURCE_BASE}/map/chests`;
const SOURCE_TELEPORTS_URL = `${SOURCE_BASE}/map/teleports`;
const OFFICIAL_API_BASE = "https://s2.easebar.com/39f12eda6b86452b";
const DEFAULT_OUTPUT = "data/guides/verified-poi-guides.json";
const DEFAULT_TRANSLATION_CACHE = "data/guides/translation-cache.vi.json";

const MAPS = [
  { id: 1, name: "Qinghe", sourceTeleportMatch: (id) => id.startsWith("201") },
  { id: 2, name: "Kaifeng", sourceTeleportMatch: (id) => id.startsWith("202") },
  {
    id: 3,
    name: "Hexi",
    sourceTeleportMatch: (id) => id.startsWith("205") && id !== "20502" && id !== "20503",
    controlPairs: [
      ["20501", "Celestial Spring Station"],
      ["20504", "Howling Sands Outpost"],
      ["20505", "Karez"],
      ["20506", "Camel Station"],
      ["20507", "Poplar Bazaar"],
      ["20508", "Squarewall Hold Ruins"],
      ["20510", "Fortress Pass"],
      ["20511", "Peaceward Camp"],
      ["20512", "Horsehelm Village"],
      ["20513", "Skybrim Market"],
    ],
  },
  { id: 4, name: "Kaifeng Imperial Palace", sourceTeleportMatch: (id) => id.startsWith("209") && Number(id.slice(3)) >= 54 },
  {
    id: 5,
    name: "Hidden Mountain",
    sourceTeleportMatch: (id) => id.startsWith("209") && Number(id.slice(3)) <= 51,
    controlPairs: [
      ["20904", "Millennium Crossing"],
      ["20905", "Witherwood Gap"],
      ["20907", "Sky Gazing Pavilion"],
      ["20908", "Seven-Hued Plain"],
      ["20909", "Brookwood Gorge"],
      ["20910", "Mohist's Method"],
      ["20914", "Meandering Bank"],
      ["20918", "Soughing Knoll"],
      ["20920", "Derndale"],
      ["20922", "Bellfade Bridge"],
      ["20923", "Cloudrise Keep"],
      ["20924", "Halfpeak Bluff"],
      ["20925", "Weeping Pool"],
      ["20926", "Lodestar Vista"],
      ["20928", "Skyward City"],
      ["20940", "Fallowfields Refuge"],
      ["20944", "Confluence Gazebo"],
      ["20948", "Mountains' Verge"],
    ],
  },
];

await loadLocalEnv(resolve(".env.local"));

const args = parseArgs(process.argv.slice(2));
const outputPath = resolve(args.output ?? DEFAULT_OUTPUT);
const translationCachePath = resolve(args["translation-cache"] ?? DEFAULT_TRANSLATION_CACHE);
const maxDistance = Number(args["max-distance"] ?? "0.00005");
const dryRun = Boolean(args["dry-run"]);

if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
  throw new Error("--max-distance must be a positive number");
}

const [sourceChests, sourceTeleports, ...officialMaps] = await Promise.all([
  fetchCommunityPoints(SOURCE_CHESTS_URL),
  fetchCommunityPoints(SOURCE_TELEPORTS_URL),
  ...MAPS.map((map) => fetchOfficialMap(map)),
]);

if (sourceChests.length < 1000) {
  throw new Error(`community source returned only ${sourceChests.length} chest records; refusing to overwrite the catalog`);
}

const transforms = new Map();
const regionTeleports = new Map();
for (const official of officialMaps) {
  const map = official.map;
  const teleports = sourceTeleports.filter((point) => map.sourceTeleportMatch(String(point.pointId)));
  const controls = map.controlPairs
    ? map.controlPairs.map(([sourceID, officialName]) => ({
        source: teleports.find((point) => String(point.pointId) === sourceID),
        target: official.teleports.find((point) => point.name === officialName),
      }))
    : teleports.slice(0, official.teleports.length).map((source, index) => ({ source, target: official.teleports[index] }));
  if (controls.some((control) => !control.source || !control.target)) {
    throw new Error(`a configured teleport control is missing for ${map.name}`);
  }
  if (controls.length < 3) {
    throw new Error(`not enough shared teleport controls for ${map.name}: ${controls.length}`);
  }
  const fitted = fitRobustAffine(controls);
  transforms.set(map.id, fitted);
  regionTeleports.set(map.id, teleports);
}

const sourceByRegion = new Map(MAPS.map((map) => [map.id, []]));
for (const chest of sourceChests) {
  const mapID = classifyRegion(chest, regionTeleports);
  sourceByRegion.get(mapID).push(chest);
}

const matches = [];
const regionReports = [];
for (const official of officialMaps) {
  const source = sourceByRegion.get(official.map.id);
  const transformed = source.map((point) => ({ point, coordinates: applyAffine(transforms.get(official.map.id), point) }));
  const regionMatches = greedyMatch(transformed, official.chests, maxDistance);
  matches.push(...regionMatches.map((match) => ({ ...match, map: official.map })));

  const residuals = transforms.get(official.map.id).residuals;
  regionReports.push({
    map_id: official.map.id,
    map: official.map.name,
    control_points: transforms.get(official.map.id).controlCount,
    control_rmse: round(rootMeanSquare(residuals), 7),
    source_chests: source.length,
    official_chests: official.chests.length,
    matched: regionMatches.length,
    unmatched_source: source.length - regionMatches.length,
    unmatched_official: official.chests.length - regionMatches.length,
    match_rmse: round(rootMeanSquare(regionMatches.map((match) => match.distance)), 7),
    match_max_distance: round(Math.max(0, ...regionMatches.map((match) => match.distance)), 7),
  });
}

const syncDate = new Date().toISOString().slice(0, 10);
const sourceDescriptions = [
  ...new Set(
    matches
      .map((match) => cleanText(match.source.descEn) || cleanText(match.source.desc))
      .filter((description) => description !== ""),
  ),
];
const translationCache = await readTranslationCache(translationCachePath);
const missingTranslations = sourceDescriptions.filter((description) => !cleanText(translationCache.translations[description]));
if (missingTranslations.length > 0) {
  if (dryRun) {
    throw new Error(
      `${missingTranslations.length} Vietnamese translations are missing; run npm run sync:guides without --dry-run to populate the cache`,
    );
  }
  await translateMissingDescriptions(missingTranslations, translationCache, translationCachePath);
}

const syncedGuides = {};
for (const match of matches.sort((left, right) => left.official.id - right.official.id)) {
  const rawSourceDescription = cleanText(match.source.descEn) || cleanText(match.source.desc);
  const sourceDescription = rawSourceDescription ? cleanText(translationCache.translations[rawSourceDescription]) : "";
  const imageURL = validHTTPS(match.source.descIcon) ? match.source.descIcon : undefined;
  if (!sourceDescription && !imageURL) continue;

  const officialID = `OFFICIAL_${match.map.id}_${match.official.id}`;
  const location = cleanText(match.source.cityNameEn) || cleanText(match.source.cityName) || match.map.name;
  const safeLocation = containsHanCharacters(location) ? match.map.name : location;
  const latestSourceUpdate = formatEpochDate(match.source.updateTime) || syncDate;
  const guide = {
    ...(sourceDescription ? { solution_steps: [sourceDescription] } : {}),
    ...(imageURL
      ? {
          reference_images: [
            {
              url: imageURL,
              alt: `Ảnh tham chiếu rương báu tại ${safeLocation}`,
              source_url: SOURCE_CHESTS_URL,
            },
          ],
        }
      : {}),
    provenance: {
      source: "Where Winds Meet Calculator community map — bản dịch máy tiếng Việt",
      source_url: SOURCE_CHESTS_URL,
      source_type: "community_sync",
      verification_status: "source_synced",
      patch_version: `community-${latestSourceUpdate}`,
      last_verified_date: syncDate,
    },
    sync: {
      source_record_id: String(match.source.id),
      source_point_id: String(match.source.pointId),
      official_map_id: match.map.id,
      coordinate_distance: round(match.distance, 7),
      source_updated_at: latestSourceUpdate,
      translation_provider: translationCache.provider,
      translation_model: translationCache.translation_models?.[rawSourceDescription] || translationCache.model,
      translation_language: "vi",
    },
  };
  syncedGuides[officialID] = guide;
}

const existingCatalog = await readExistingCatalog(outputPath);
const preservedGuides = Object.fromEntries(
  Object.entries(existingCatalog.guides ?? {}).filter(([, guide]) => guide?.provenance?.source_type !== "community_sync"),
);
const guides = { ...syncedGuides, ...preservedGuides };
const catalog = { schema_version: 1, guides };
const report = {
  source: SOURCE_CHESTS_URL,
  source_records: sourceChests.length,
  matched_records: matches.length,
  synced_guides: Object.keys(syncedGuides).length,
  preserved_curated_guides: Object.keys(preservedGuides).length,
  catalog_guides: Object.keys(guides).length,
  guides_with_images: Object.values(syncedGuides).filter((guide) => guide.reference_images?.length > 0).length,
  guides_with_instructions: Object.values(syncedGuides).filter((guide) => guide.solution_steps?.length > 0).length,
  translation_cache_entries: Object.keys(translationCache.translations).length,
  translations_added: missingTranslations.length,
  skipped_without_content: matches.length - Object.keys(syncedGuides).length,
  max_distance: maxDistance,
  regions: regionReports,
  output: dryRun ? null : outputPath,
  dry_run: dryRun,
};

if (!dryRun) {
  if (Object.keys(syncedGuides).length < 2_000 && !args["allow-partial"]) {
    throw new Error(
      `only ${Object.keys(syncedGuides).length} guides matched; refusing to replace the catalog (pass --allow-partial to override)`,
    );
  }
  await atomicWriteJSON(outputPath, catalog);
}

console.log(JSON.stringify(report, null, 2));

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) throw new Error(`unexpected argument: ${value}`);
    const [rawKey, inlineValue] = value.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      result[rawKey] = inlineValue;
    } else if (values[index + 1] && !values[index + 1].startsWith("--")) {
      result[rawKey] = values[index + 1];
      index += 1;
    } else {
      result[rawKey] = true;
    }
  }
  return result;
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/json",
          "Accept-Language": "en-US,en;q=0.8",
          "User-Agent": "WWM-Companion-Guide-Sync/1.0 (+local deterministic data sync)",
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 500));
    }
  }
  throw new Error(`failed to fetch ${url} after 3 attempts: ${lastError?.message ?? lastError}`);
}

async function loadLocalEnv(path) {
  try {
    const payload = await readFile(path, "utf8");
    for (const line of payload.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const name = trimmed.slice(0, separator).trim();
      const value = trimmed
        .slice(separator + 1)
        .trim()
        .replace(/^(['"])(.*)\1$/u, "$2");
      if (!(name in process.env)) process.env[name] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function readTranslationCache(path) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (value?.schema_version !== 1 || typeof value.translations !== "object" || value.translations === null) {
      throw new Error("unsupported translation cache format");
    }
    return value;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        schema_version: 1,
        language: "vi",
        provider: "openrouter",
        model: process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free",
        translations: {},
        translation_models: {},
      };
    }
    throw new Error(`could not read translation cache: ${error.message}`);
  }
}

async function translateMissingDescriptions(descriptions, cache, cachePath) {
  const apiKey = cleanText(process.env.OPENROUTER_API_KEY);
  if (!apiKey) {
    throw new Error(
      `${descriptions.length} descriptions need Vietnamese translation, but OPENROUTER_API_KEY is not configured; catalog was not changed`,
    );
  }
  const baseURL = cleanText(process.env.OPENROUTER_BASE_URL) || "https://openrouter.ai/api/v1";
  const models = [
    cleanText(process.env.OPENROUTER_MODEL) || "google/gemma-4-26b-a4b-it:free",
    ...String(process.env.OPENROUTER_FALLBACK_MODELS || "")
      .split(",")
      .map(cleanText),
  ].filter((model, index, values) => model && values.indexOf(model) === index);
  const batchSize = 50;

  cache.provider = "openrouter";
  cache.model = models[0];
  cache.translation_models ??= {};
  for (let offset = 0; offset < descriptions.length; offset += batchSize) {
    const batch = descriptions.slice(offset, offset + batchSize);
    const input = Object.fromEntries(batch.map((description, index) => [String(index), description]));
    let result = await translateBatchWithOpenRouter(baseURL, apiKey, models, input);
    const translated = { ...result.translations };
    if (result.model !== models[0]) {
      models.splice(models.indexOf(result.model), 1);
      models.unshift(result.model);
    }
    for (let retry = 0; retry < 2; retry += 1) {
      const invalidIndexes = batch
        .map((_, index) => String(index))
        .filter((index) => !cleanText(translated[index]) || containsHanCharacters(cleanText(translated[index])));
      if (invalidIndexes.length === 0) break;
      for (const index of invalidIndexes) {
        const retryInput = { "0": { source: input[index], draft: cleanText(translated[index]) } };
        result = await translateBatchWithOpenRouter(baseURL, apiKey, models, retryInput, true);
        translated[index] = result.translations["0"];
      }
    }
    for (const [index, source] of batch.entries()) {
      const result = cleanText(translated[String(index)]);
      if (!result || containsHanCharacters(result)) {
        throw new Error(
          `translation batch ${Math.floor(offset / batchSize) + 1} returned an invalid Vietnamese translation for: ${source} => ${result}`,
        );
      }
      cache.translations[source] = result;
      cache.translation_models[source] = models[0];
    }
    cache.updated_at = new Date().toISOString();
    await atomicWriteJSON(cachePath, cache);
    console.error(`Translated ${Math.min(offset + batch.length, descriptions.length)}/${descriptions.length} missing descriptions`);
  }
}

async function translateBatchWithOpenRouter(baseURL, apiKey, models, input, repair = false) {
  const endpoint = `${baseURL.replace(/\/$/u, "")}/chat/completions`;
  const prompt = repair
    ? [
        "Repair every Vietnamese draft in this JSON object so that it contains ZERO Chinese Han characters.",
        "Each value has a Chinese source and a partially translated Vietnamese draft. Translate every remaining Chinese character, including characters embedded inside proper names.",
        "For an unknown proper name, use its Sino-Vietnamese reading. Never copy a Chinese character. Preserve the source facts and do not add advice.",
        "Examples: Phật Gia寨 = trại Phật Gia; 千斤坠 = Thiên Cân Trụy; 三更天 = Tam Canh Thiên; 蹴鞠 = Thúc Cúc; 鲁班锁 = khóa Lỗ Ban.",
        "Return one valid JSON object with exactly the same keys and fully Vietnamese string values. Do not use Markdown.",
        JSON.stringify(input),
      ].join("\n")
    : [
        "Translate every value in the JSON object from Simplified Chinese into natural, concise Vietnamese for a Where Winds Meet treasure-chest guide.",
        "This is translation only: preserve every fact, number, proper noun, and gameplay instruction; do not add advice or explanations.",
        "Translate or Vietnamese-transliterate every Chinese proper name. If no localized name is known, use its Sino-Vietnamese reading. Output must contain no Chinese Han characters.",
        "Use consistent game terms: 宝箱 = rương báu, 普通箱子 = rương thường, 最终宝箱 = rương báu cuối cùng, 天工地窟 = Địa Quật Thiên Công, 千斤坠 = Thiên Cân Trụy, 三更天 = Tam Canh Thiên, 蹴鞠 = Thúc Cúc, 鲁班锁 = khóa Lỗ Ban.",
        "Return one valid JSON object with exactly the same keys and Vietnamese string values. Do not use Markdown.",
        JSON.stringify(input),
      ].join("\n");
  const failures = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    for (const model of models) {
      try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3199",
          "X-Title": "Where Winds Meet Companion Guide Sync",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "You are a deterministic Chinese-to-Vietnamese game localization engine. Output JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0,
          max_tokens: 6000,
          reasoning: { effort: "none", exclude: true },
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const payload = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${payload.slice(0, 300)}`);
      const result = JSON.parse(payload);
      const content = result?.choices?.[0]?.message?.content;
      if (!content) throw new Error("translation provider returned no message content");
      const translated = JSON.parse(content);
      const expectedKeys = Object.keys(input);
      if (repair && translated && typeof translated === "object") {
        for (const key of expectedKeys) {
          if (translated[key] && typeof translated[key] === "object" && typeof translated[key].draft === "string") {
            translated[key] = translated[key].draft;
          }
        }
      }
      if (
        !translated ||
        typeof translated !== "object" ||
        expectedKeys.some((key) => typeof translated[key] !== "string")
      ) {
        throw new Error(`translation provider returned incomplete JSON: ${content.slice(0, 500)}`);
      }
        return { translations: translated, model };
      } catch (error) {
        failures.push(`${model}: ${error.message}`);
      }
    }
    if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 3_000));
  }
  throw new Error(`Vietnamese translation failed: ${failures.join("; ")}`);
}

async function fetchCommunityPoints(url) {
  const html = await fetchText(url);
  const marker = "self.__next_f.push(";
  let cursor = 0;
  let stream = "";
  while ((cursor = html.indexOf(marker, cursor)) >= 0) {
    const end = html.indexOf("</script>", cursor);
    if (end < 0) break;
    const serializedCall = html.slice(cursor + marker.length, end - 1);
    const frame = JSON.parse(serializedCall);
    if (frame[0] === 1 && typeof frame[1] === "string") stream += frame[1];
    cursor = end + 9;
  }

  const records = new Map();
  for (const line of stream.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    try {
      let encoded = line.slice(separator + 1);
      if (encoded.startsWith("{\\\"") || encoded.startsWith("[\\\"")) {
        encoded = JSON.parse(`"${encoded}"`);
      }
      const value = JSON.parse(encoded);
      if (value && value.id && value.pointId && value.mapId && Number.isFinite(value.x) && Number.isFinite(value.y)) {
        records.set(String(value.id), value);
      }
    } catch {
      // The RSC stream also contains framework records and references, which are intentionally ignored.
    }
  }
  return [...records.values()];
}

async function fetchOfficialMap(map) {
  const payload = JSON.parse(await fetchText(`${OFFICIAL_API_BASE}/api/map/points?mapId=${map.id}&lang=en-US`));
  if (!payload.success) throw new Error(`official map API reported failure for ${map.name}`);
  const categories = payload.data.categories.flatMap((group) => group.childCategories);
  return {
    map,
    teleports: parseOfficialPoints(categories.find((category) => category.id === 3)?.pointList ?? []),
    chests: parseOfficialPoints(categories.find((category) => category.id === 11)?.pointList ?? []),
  };
}

function parseOfficialPoints(points) {
  return points.flatMap((point) => {
    const x = parseOfficialCoordinate(point.lng);
    const y = parseOfficialCoordinate(point.lat);
    return Number.isFinite(x) && Number.isFinite(y) ? [{ ...point, x, y }] : [];
  });
}

function parseOfficialCoordinate(value) {
  const text = String(value).trim();
  const sign = text.startsWith("-") ? -1 : 1;
  const digits = text.replace(/^[+-]/, "");
  return (sign * Number.parseInt(digits, 8)) / 100_000;
}

function fitRobustAffine(controls) {
  const inlierThreshold = 0.00005;
  let accepted = [];
  let bestRMSE = Number.POSITIVE_INFINITY;
  for (let first = 0; first < controls.length - 2; first += 1) {
    for (let second = first + 1; second < controls.length - 1; second += 1) {
      for (let third = second + 1; third < controls.length; third += 1) {
        let candidate;
        try {
          candidate = fitAffine([controls[first], controls[second], controls[third]]);
        } catch {
          continue;
        }
        const inliers = controls.filter((control) => controlResidual(candidate, control) <= inlierThreshold);
        if (inliers.length < 3) continue;
        const rmse = rootMeanSquare(inliers.map((control) => controlResidual(candidate, control)));
        if (inliers.length > accepted.length || (inliers.length === accepted.length && rmse < bestRMSE)) {
          accepted = inliers;
          bestRMSE = rmse;
        }
      }
    }
  }
  if (accepted.length < 3) throw new Error("could not find a stable coordinate transform");
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const candidate = fitAffine(accepted);
    const filtered = controls.filter((control) => controlResidual(candidate, control) <= inlierThreshold);
    if (filtered.length === accepted.length) break;
    accepted = filtered;
  }
  const transform = fitAffine(accepted);
  transform.controlCount = accepted.length;
  transform.residuals = accepted.map((control) => controlResidual(transform, control));
  return transform;
}

function fitAffine(controls) {
  const normal = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const targetX = [0, 0, 0];
  const targetY = [0, 0, 0];
  for (const { source, target } of controls) {
    const row = [source.x, source.y, 1];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) normal[i][j] += row[i] * row[j];
      targetX[i] += row[i] * target.x;
      targetY[i] += row[i] * target.y;
    }
  }
  return { x: solve3(normal, targetX), y: solve3(normal, targetY) };
}

function solve3(matrix, vector) {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-12) throw new Error("coordinate transform is singular");
    for (let item = column; item < 4; item += 1) augmented[column][item] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item < 4; item += 1) augmented[row][item] -= factor * augmented[column][item];
    }
  }
  return augmented.map((row) => row[3]);
}

function applyAffine(transform, point) {
  return {
    x: transform.x[0] * point.x + transform.x[1] * point.y + transform.x[2],
    y: transform.y[0] * point.x + transform.y[1] * point.y + transform.y[2],
  };
}

function controlResidual(transform, control) {
  return distance(applyAffine(transform, control.source), control.target);
}

function classifyRegion(point, regionPoints) {
  let selectedMapID;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const [mapID, teleports] of regionPoints) {
    for (const teleport of teleports) {
      const candidate = squaredDistance(point, teleport);
      if (candidate < selectedDistance) {
        selectedDistance = candidate;
        selectedMapID = mapID;
      }
    }
  }
  if (!selectedMapID) throw new Error(`could not classify community point ${point.id}`);
  return selectedMapID;
}

function greedyMatch(sourcePoints, officialPoints, threshold) {
  const candidates = [];
  for (const source of sourcePoints) {
    for (const official of officialPoints) {
      const candidateDistance = distance(source.coordinates, official);
      if (candidateDistance <= threshold) candidates.push({ source: source.point, official, distance: candidateDistance });
    }
  }
  candidates.sort((left, right) => left.distance - right.distance);
  const usedSource = new Set();
  const usedOfficial = new Set();
  const result = [];
  for (const candidate of candidates) {
    if (usedSource.has(candidate.source.id) || usedOfficial.has(candidate.official.id)) continue;
    usedSource.add(candidate.source.id);
    usedOfficial.add(candidate.official.id);
    result.push(candidate);
  }
  return result;
}

function squaredDistance(left, right) {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function distance(left, right) {
  return Math.sqrt(squaredDistance(left, right));
}

function rootMeanSquare(values) {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((total, value) => total + value ** 2, 0) / values.length);
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function containsHanCharacters(value) {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(value);
}

function validHTTPS(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function formatEpochDate(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return new Date(number).toISOString().slice(0, 10);
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function readExistingCatalog(path) {
  try {
    const catalog = JSON.parse(await readFile(path, "utf8"));
    return catalog?.schema_version === 1 && catalog.guides ? catalog : { schema_version: 1, guides: {} };
  } catch (error) {
    if (error?.code === "ENOENT") return { schema_version: 1, guides: {} };
    throw new Error(`could not read existing guide catalog: ${error.message}`);
  }
}

async function atomicWriteJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
