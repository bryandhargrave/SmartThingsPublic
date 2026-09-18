// Shared catalog constants — pure data, no platform deps, so both the Node
// server (via config.js) and the Cloudflare Worker can import them without
// forking the lists. Edit here; both runtimes see the change.

// Known design / measurement applications. Free text is also accepted so the
// list never blocks a submission for an app we have not enumerated yet.
export const KNOWN_APPLICATIONS = [
  'ArrayCalc',              // d&b audiotechnik
  'Soundvision',            // L-Acoustics
  'MAPP 3D',                // Meyer Sound
  'DISPLAY 3',              // Martin Audio
  'Blueprint AV',           // Adamson
  'NS-1',                   // NEXO
  'EASE / EASE Focus',      // AFMG
  'GLL / Loudspeaker data', // AFMG GLL box data
  'Modeler',                // Bose Professional
  'Smaart',                 // Rational Acoustics
  'Other',
];

export const VENUE_TYPES = [
  'Arena',
  'Stadium',
  'Amphitheater',
  'Theater',
  'Concert Hall',
  'Club / Live Music',
  'Ballroom',
  'Convention Center',
  'House of Worship',
  'Outdoor Festival Site',
  'Corporate / AV',
  'Other',
];
