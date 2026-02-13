import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractAttr(tag, name) {
  const m = new RegExp(`${name}="([^"]+)"`).exec(tag);
  return m ? m[1] : undefined;
}

function parseTmx(tmx) {
  const mapTag = /<map\b[^>]*>/.exec(tmx)?.[0];
  if (!mapTag) throw new Error("TMX: missing <map>");
  const width = Number(extractAttr(mapTag, "width"));
  const height = Number(extractAttr(mapTag, "height"));
  const tilewidth = Number(extractAttr(mapTag, "tilewidth"));
  const tileheight = Number(extractAttr(mapTag, "tileheight"));
  const orientation = extractAttr(mapTag, "orientation") ?? "orthogonal";
  const renderorder = extractAttr(mapTag, "renderorder") ?? "right-down";
  const version = extractAttr(mapTag, "version") ?? "1.0";

  const tilesetTag = /<tileset\b[^>]*>[\s\S]*?<\/tileset>/.exec(tmx)?.[0];
  if (!tilesetTag) throw new Error("TMX: missing <tileset>");
  const tilesetOpen = /<tileset\b[^>]*>/.exec(tilesetTag)?.[0];
  if (!tilesetOpen) throw new Error("TMX: tileset open tag missing");
  const firstgid = Number(extractAttr(tilesetOpen, "firstgid") ?? "1");
  const tilesetName = extractAttr(tilesetOpen, "name") ?? "Tileset";
  const spacing = Number(extractAttr(tilesetOpen, "spacing") ?? "0");
  const imageTag = /<image\b[^>]*\/>/.exec(tilesetTag)?.[0];
  if (!imageTag) throw new Error("TMX: tileset image tag missing");
  const image = extractAttr(imageTag, "source");
  const imagewidth = Number(extractAttr(imageTag, "width"));
  const imageheight = Number(extractAttr(imageTag, "height"));

  const columns = Math.floor((imagewidth + spacing) / (tilewidth + spacing));
  const rows = Math.floor((imageheight + spacing) / (tileheight + spacing));
  const tilecount = columns * rows;

  const layers = [];
  const layerRe = /<layer\b[^>]*>[\s\S]*?<\/layer>/g;
  for (const layerBlock of tmx.matchAll(layerRe)) {
    const layerXml = layerBlock[0];
    const layerOpen = /<layer\b[^>]*>/.exec(layerXml)?.[0];
    if (!layerOpen) continue;
    const name = extractAttr(layerOpen, "name") ?? "Layer";
    const lw = Number(extractAttr(layerOpen, "width") ?? String(width));
    const lh = Number(extractAttr(layerOpen, "height") ?? String(height));

    const dataTag = /<data\b[^>]*>[\s\S]*?<\/data>/.exec(layerXml)?.[0];
    if (!dataTag) continue;
    const dataOpen = /<data\b[^>]*>/.exec(dataTag)?.[0] ?? "";
    const encoding = extractAttr(dataOpen, "encoding");
    const compression = extractAttr(dataOpen, "compression");
    if (encoding !== "base64" || compression !== "zlib") {
      throw new Error(`TMX: unsupported encoding/compression for layer "${name}"`);
    }
    const base64 = dataTag
      .replace(/<data\b[^>]*>/, "")
      .replace(/<\/data>/, "")
      .replace(/\s+/g, "");
    const raw = zlib.inflateSync(Buffer.from(base64, "base64"));
    const count = lw * lh;
    const data = new Array(count);
    for (let i = 0; i < count; i++) data[i] = raw.readUInt32LE(i * 4);

    layers.push({
      data,
      height: lh,
      width: lw,
      name,
      opacity: 1,
      type: "tilelayer",
      visible: true,
      x: 0,
      y: 0,
    });
  }

  return {
    compressionlevel: -1,
    height,
    infinite: false,
    layers,
    nextlayerid: layers.length + 1,
    nextobjectid: 1,
    orientation,
    renderorder,
    tiledversion: "1.0",
    tileheight,
    tilesets: [
      {
        columns,
        firstgid,
        image,
        imageheight,
        imagewidth,
        margin: 0,
        name: tilesetName,
        spacing,
        tilecount,
        tileheight,
        tilewidth,
      },
    ],
    tilewidth,
    type: "map",
    version,
    width,
  };
}

function convertOne(relTmxPath) {
  const absTmx = path.join(root, relTmxPath);
  const tmx = readFile(absTmx);
  const json = parseTmx(tmx);
  const out = absTmx.replace(/\.tmx$/i, ".json");
  fs.writeFileSync(out, JSON.stringify(json));
  return { in: absTmx, out };
}

const targets = [
  "public/assets/map/town/town.tmx",
];

for (const t of targets) {
  const { out } = convertOne(t);
  process.stdout.write(`wrote ${out}\n`);
}
