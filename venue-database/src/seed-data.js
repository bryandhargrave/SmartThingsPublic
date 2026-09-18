// Seed dataset.
//
// VENUES: factual, publicly-known information about notable venues (name,
// location, approximate capacity/coordinates, general acoustic notes). Venue
// facts are not copyrightable; this gives a fresh install a realistic catalog.
// Capacities and coordinates are approximate and community-correctable.
//
// REFERENCES: links to officially free, publicly downloadable manufacturer
// resources — catalogued as links (never rehosted binaries) with a license
// note. Populated from verified sources only. `venue` matches a venue `name`,
// or is null for a general (non-venue-specific) resource attached to nothing.

export const VENUES = [
  {
    name: 'Red Rocks Amphitheatre', type: 'Amphitheater', city: 'Morrison',
    region: 'Colorado', country: 'United States', latitude: 39.665, longitude: -105.205,
    capacity: 9525, website: 'https://www.redrocksonline.com',
    description: 'Open-air amphitheatre in red sandstone. Strong, shifting wind and large reflective rock faces flanking the stage make coverage and trim heights a recurring challenge.',
  },
  {
    name: 'The Gorge Amphitheatre', type: 'Amphitheater', city: 'George',
    region: 'Washington', country: 'United States', latitude: 47.099, longitude: -119.993,
    capacity: 27500, website: 'https://www.gorgeamphitheatre.net',
    description: 'Grass-bowl amphitheatre overlooking the Columbia River gorge. Very long throws to the back of the lawn; wind off the canyon is a factor.',
  },
  {
    name: 'Hollywood Bowl', type: 'Amphitheater', city: 'Los Angeles',
    region: 'California', country: 'United States', latitude: 34.112, longitude: -118.339,
    capacity: 17500, website: 'https://www.hollywoodbowl.com',
    description: 'Iconic band-shell amphitheatre. The shell and terraced seating shape reflections; house system is a distributed design with delays up the hill.',
  },
  {
    name: 'Madison Square Garden', type: 'Arena', city: 'New York',
    region: 'New York', country: 'United States', latitude: 40.750, longitude: -73.993,
    capacity: 20789, website: 'https://www.msg.com',
    description: 'Round arena with a domed roof — reflective ceiling and bowl geometry demand careful array splay and low-end control.',
  },
  {
    name: 'Sphere', type: 'Arena', city: 'Las Vegas',
    region: 'Nevada', country: 'United States', latitude: 36.121, longitude: -115.161,
    capacity: 17600, website: 'https://www.thespherevegas.com',
    description: 'Spherical venue with a beamforming/immersive house audio system built into the structure. Highly non-traditional room for a touring PA.',
  },
  {
    name: 'Ryman Auditorium', type: 'Theater', city: 'Nashville',
    region: 'Tennessee', country: 'United States', latitude: 36.161, longitude: -86.778,
    capacity: 2362, website: 'https://www.ryman.com',
    description: 'Former tabernacle, celebrated natural acoustics with wooden pews and a curved balcony. Warm and lively — vocal intelligibility is easy, low-mid buildup is the watch-out.',
  },
  {
    name: 'Royal Albert Hall', type: 'Concert Hall', city: 'London',
    region: 'England', country: 'United Kingdom', latitude: 51.501, longitude: -0.177,
    capacity: 5272, website: 'https://www.royalalberthall.com',
    description: 'Victorian round hall with a long reverb tail and a famous dome; suspended "mushroom" diffusers tame the focused echo but delay design around the round geometry still needs care.',
  },
  {
    name: 'The O2 Arena', type: 'Arena', city: 'London',
    region: 'England', country: 'United Kingdom', latitude: 51.503, longitude: 0.003,
    capacity: 20000, website: 'https://www.theo2.co.uk',
    description: 'Large multi-purpose arena under a tented dome. Big cubic volume; long reverberation and roof reflections drive array and sub choices.',
  },
  {
    name: 'Ziggo Dome', type: 'Arena', city: 'Amsterdam',
    region: 'North Holland', country: 'Netherlands', latitude: 52.314, longitude: 4.937,
    capacity: 17000, website: 'https://www.ziggodome.nl',
    description: 'Purpose-built indoor music arena with variable acoustic curtains — a well-behaved modern room for line arrays.',
  },
  {
    name: 'AccorHotels Arena (Bercy)', type: 'Arena', city: 'Paris',
    region: 'Île-de-France', country: 'France', latitude: 48.839, longitude: 2.379,
    capacity: 20300, website: 'https://www.accorarena.com',
    description: 'Pyramid-profiled arena with sloped, grass-clad exterior; interior is a large reverberant bowl.',
  },
  {
    name: 'Elbphilharmonie (Großer Saal)', type: 'Concert Hall', city: 'Hamburg',
    region: 'Hamburg', country: 'Germany', latitude: 53.541, longitude: 9.984,
    capacity: 2100, website: 'https://www.elbphilharmonie.de',
    description: 'Vineyard-style concert hall with the "White Skin" parametric diffusion panels; tuned primarily for acoustic music, tight sightlines for rigging.',
  },
  {
    name: 'Berlin Philharmonie', type: 'Concert Hall', city: 'Berlin',
    region: 'Berlin', country: 'Germany', latitude: 52.510, longitude: 13.370,
    capacity: 2440, website: 'https://www.berliner-philharmoniker.de',
    description: 'Original vineyard-terrace concert hall (Scharoun). Surround seating around the stage complicates any reinforced-audio design.',
  },
  {
    name: 'Concertgebouw (Main Hall)', type: 'Concert Hall', city: 'Amsterdam',
    region: 'North Holland', country: 'Netherlands', latitude: 52.356, longitude: 4.879,
    capacity: 1974, website: 'https://www.concertgebouw.nl',
    description: 'Shoebox hall renowned for long, rich reverberation — glorious for orchestra, demanding for amplified programme.',
  },
  {
    name: 'Sydney Opera House (Concert Hall)', type: 'Concert Hall', city: 'Sydney',
    region: 'New South Wales', country: 'Australia', latitude: -33.857, longitude: 151.215,
    capacity: 2679, website: 'https://www.sydneyoperahouse.com',
    description: 'Recently renovated concert hall with new acoustic reflectors and improved rigging provisions; check the current plot for hang points.',
  },
  {
    name: 'Sydney Opera House (Joan Sutherland Theatre)', type: 'Theater', city: 'Sydney',
    region: 'New South Wales', country: 'Australia', latitude: -33.857, longitude: 151.214,
    capacity: 1507, website: 'https://www.sydneyoperahouse.com',
    description: 'Proscenium lyric theatre; tighter volume and a pit, primarily opera/ballet.',
  },
  {
    name: 'Wembley Stadium', type: 'Stadium', city: 'London',
    region: 'England', country: 'United Kingdom', latitude: 51.556, longitude: -0.279,
    capacity: 90000, website: 'https://www.wembleystadium.com',
    description: 'Bowl stadium with a partial retractable roof and the signature arch. Huge distances and open-air reflections; delay towers and heavy sub arrays are typical.',
  },
  {
    name: 'Rose Bowl', type: 'Stadium', city: 'Pasadena',
    region: 'California', country: 'United States', latitude: 34.161, longitude: -118.168,
    capacity: 88500, website: 'https://www.rosebowlstadium.com',
    description: 'Open oval stadium. Long throws, wind, and neighbourhood SPL limits shape festival system designs.',
  },
  {
    name: 'MetLife Stadium', type: 'Stadium', city: 'East Rutherford',
    region: 'New Jersey', country: 'United States', latitude: 40.814, longitude: -74.074,
    capacity: 82500, website: 'https://www.metlifestadium.com',
    description: 'Open-air NFL bowl frequently used for stadium tours; end-stage designs need substantial delay rings.',
  },
  {
    name: 'Estadio Azteca', type: 'Stadium', city: 'Mexico City',
    region: 'CDMX', country: 'Mexico', latitude: 19.303, longitude: -99.150,
    capacity: 87000, website: 'https://www.estadioazteca.com.mx',
    description: 'High-altitude, steep-tier stadium bowl; large reverberant returns off opposite stands.',
  },
  {
    name: 'Foro Sol', type: 'Stadium', city: 'Mexico City',
    region: 'CDMX', country: 'Mexico', latitude: 19.406, longitude: -99.096,
    capacity: 65000, website: '',
    description: 'Baseball/auto-racing bowl used as a major concert venue; wide, open field layout for festival-scale PA.',
  },
  {
    name: 'Budokan', type: 'Arena', city: 'Tokyo',
    region: 'Tokyo', country: 'Japan', latitude: 35.693, longitude: 139.750,
    capacity: 14471, website: 'https://www.nipponbudokan.or.jp',
    description: 'Octagonal martial-arts hall with a tent-like roof; storied but acoustically lively room for concerts.',
  },
  {
    name: 'Tokyo Dome', type: 'Stadium', city: 'Tokyo',
    region: 'Tokyo', country: 'Japan', latitude: 35.706, longitude: 139.752,
    capacity: 55000, website: 'https://www.tokyo-dome.co.jp',
    description: 'Air-supported domed stadium ("Big Egg"); enormous reverberant volume, a serious low-frequency and intelligibility challenge.',
  },
  {
    name: 'Marina Bay Sands (Sands Theatre)', type: 'Theater', city: 'Singapore',
    region: '', country: 'Singapore', latitude: 1.285, longitude: 103.859,
    capacity: 1680, website: 'https://www.marinabaysands.com',
    description: 'Modern proscenium theatre with a fly tower; controlled acoustics suited to musical theatre and corporate AV.',
  },
  {
    name: 'Coachella — Empire Polo Club', type: 'Outdoor Festival Site', city: 'Indio',
    region: 'California', country: 'United States', latitude: 33.680, longitude: -116.238,
    capacity: 125000, website: 'https://www.coachella.com',
    description: 'Flat polo-field festival site with multiple stages; desert wind, dust and inter-stage spill are the design constraints.',
  },
  {
    name: 'Glastonbury — Pyramid Stage', type: 'Outdoor Festival Site', city: 'Pilton',
    region: 'England', country: 'United Kingdom', latitude: 51.153, longitude: -2.588,
    capacity: 100000, website: 'https://www.glastonburyfestivals.co.uk',
    description: 'Sloping farm field facing the Pyramid Stage; long throws uphill, weather-exposed, delay towers standard.',
  },
  {
    name: 'Colston Hall / Bristol Beacon', type: 'Concert Hall', city: 'Bristol',
    region: 'England', country: 'United Kingdom', latitude: 51.454, longitude: -2.598,
    capacity: 1800, website: 'https://www.bristolbeacon.org',
    description: 'Recently rebuilt concert hall with revised acoustics; mid-size room for touring and classical.',
  },
  {
    name: 'Massey Hall', type: 'Theater', city: 'Toronto',
    region: 'Ontario', country: 'Canada', latitude: 43.654, longitude: -79.379,
    capacity: 2765, website: 'https://www.masseyhall.com',
    description: 'Historic horseshoe theatre, restored, with two balconies; well-regarded acoustics and tight rigging heritage constraints.',
  },
  {
    name: 'Fox Theatre (Atlanta)', type: 'Theater', city: 'Atlanta',
    region: 'Georgia', country: 'United States', latitude: 33.772, longitude: -84.386,
    capacity: 4665, website: 'https://www.foxtheatre.org',
    description: 'Ornate 1920s movie palace with a "sky" ceiling; large ornamented surfaces scatter reflections.',
  },
  {
    name: 'Wiener Musikverein (Golden Hall)', type: 'Concert Hall', city: 'Vienna',
    region: 'Vienna', country: 'Austria', latitude: 48.201, longitude: 16.373,
    capacity: 1744, website: 'https://www.musikverein.at',
    description: 'Classic shoebox hall famed for its reverberant, enveloping acoustic; minimal reinforcement by design.',
  },
];

// Populated from verified free/official sources (see references-note.md).
export const REFERENCES = [];
