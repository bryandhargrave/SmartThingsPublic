// Seed fixtures — pure data + a pure geometry helper, shared by the Node seeder
// (seed.js) and the Cloudflare Worker's /api/admin/seed endpoint so the demo
// content is defined once. No platform deps.

// A few demo files attached by venue name, so reviews/ratings are visible on a
// fresh install. Contents are labelled placeholders, not real project files.
export const DEMO_FILES = {
  'Red Rocks Amphitheatre': [
    {
      filename: 'RedRocks_MainPA_example.dbpr', application: 'ArrayCalc', app_version: '11.x',
      description: 'DEMO placeholder — replace with a real ArrayCalc project you own. Illustrates a main + out-fill hang with ground-stacked subs.',
      uploader_name: 'seed',
      reviews: [
        { rating: 5, comment: 'Great starting geometry for the bowl — trims were close to what we flew.', reviewer_name: 'SE Marcus' },
        { rating: 4, comment: 'Solid. Dropped the mains ~30cm for the front rows on our rig.', reviewer_name: 'Tommy K' },
      ],
    },
  ],
  'Royal Albert Hall': [
    {
      filename: 'RAH_delayrings_example.svs', application: 'Soundvision', app_version: '4.x',
      description: 'DEMO placeholder — replace with a real Soundvision file you own. Shows a delay-ring approach for the round geometry.',
      uploader_name: 'seed',
      reviews: [
        { rating: 5, comment: 'The delay-ring layout is the right idea for this room — even coverage into the boxes.', reviewer_name: 'A2 Chen' },
      ],
    },
  ],
};

// A deliberately simple, SCHEMATIC room model (metres): a raked-ish audience
// plane, a stage, and a front-of-house point. Illustrative, not surveyed.
export function schematicRoom({ width, depth, stageDepth = 12, stageHeight = 1.4 }) {
  const w = width / 2;
  return {
    units: 'meters',
    origin: { note: 'SCHEMATIC placeholder geometry — origin at stage front centre. Verify against the real room.' },
    surfaces: [
      { name: 'Stage', type: 'stage', vertices: [[-w, 0, stageHeight], [w, 0, stageHeight], [w, stageDepth, stageHeight], [-w, stageDepth, stageHeight]] },
      { name: 'Audience floor', type: 'audience', vertices: [[-w, stageDepth, 0], [w, stageDepth, 0], [w, depth, 0], [-w, depth, 0]] },
    ],
    points: [
      { label: 'FOH', x: 0, y: depth * 0.68, z: 1.5 },
      { label: 'Stage centre', x: 0, y: 0, z: stageHeight },
    ],
  };
}

export const GEOMETRY = {
  'Red Rocks Amphitheatre': schematicRoom({ width: 60, depth: 90, stageDepth: 14, stageHeight: 1.4 }),
  'Ziggo Dome': schematicRoom({ width: 70, depth: 100, stageDepth: 16, stageHeight: 1.6 }),
};
