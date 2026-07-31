import type { Platform } from "./types";

// ============================================================
// EXAMPLE PRESETS
// ============================================================
// Quick-fill examples for the Add-Profile flow so you can test without typing
// follower counts by hand. Names/industries and `marketNPSI` (the real live
// pauv price, kept as a reference) are real; the per-platform follower counts
// are mock stand-ins for the real API pulls.
// ============================================================

export interface ExampleProfile {
  id: string;
  name: string;
  industry: string;
  followers: Partial<Record<Platform, number>>; // omitted platforms default to 0/blank
  marketNPSI: number | null; // real live pauv price, shown as reference
  query: string;
  snippets: string[];
}

export const SEED_PROFILES: ExampleProfile[] = [
  // ---------- Anchors: real pauv listings ----------
  {
    id: "musk", name: "Elon Musk", industry: "Business", marketNPSI: 70.13,
    followers: { tiktok: 0, x: 195_000_000, instagram: 0, youtube: 0 },
    query: "Elon Musk",
    snippets: [
      "Elon Musk faces backlash over controversial remarks, critics slam the decision",
      "Elon Musk's company reports strong profit growth, investors pleased",
      "Musk praised for bold innovation despite fierce criticism and legal disputes",
    ],
  },
  {
    id: "trump", name: "Donald Trump", industry: "Politics", marketNPSI: 65.65,
    followers: { tiktok: 15_000_000, x: 87_000_000, instagram: 27_000_000, youtube: 2_700_000 },
    query: "Donald Trump",
    snippets: [
      "Trump rallies huge crowds as supporters celebrate the campaign push",
      "Trump faces sharp criticism and legal trouble, opponents condemn remarks",
      "Trump's policy announcement sparks fierce debate across the country",
    ],
  },
  {
    id: "lebron", name: "LeBron James", industry: "Sports", marketNPSI: 56.07,
    followers: { tiktok: 17_000_000, x: 53_000_000, instagram: 160_000_000, youtube: 6_000_000 },
    query: "LeBron James",
    snippets: [
      "LeBron James delivers a masterful game, fans and analysts full of praise",
      "LeBron James passes a historic milestone, celebrated across the league",
      "LeBron criticized by rivals but supporters call him the greatest ever",
    ],
  },
  {
    id: "rogan", name: "Joe Rogan", industry: "Comedy", marketNPSI: 52.95,
    followers: { tiktok: 3_500_000, x: 12_000_000, instagram: 20_000_000, youtube: 19_000_000 },
    query: "Joe Rogan podcast",
    snippets: [
      "Joe Rogan's podcast tops the charts again, listeners praise the candid interviews",
      "Joe Rogan sparks controversy with a guest, critics condemn the remarks",
      "Rogan's episode goes viral, fans love the wide-ranging conversation",
    ],
  },
  {
    id: "bieber", name: "Justin Bieber", industry: "Music", marketNPSI: 52.64,
    followers: { tiktok: 32_000_000, x: 111_000_000, instagram: 294_000_000, youtube: 72_000_000 },
    query: "Justin Bieber",
    snippets: [
      "Justin Bieber's surprise release delights fans, warmly received by critics",
      "Bieber cancels shows citing health, fans express concern and sadness",
      "Justin Bieber's comeback performance earns strong praise",
    ],
  },
  {
    id: "ye", name: "Kanye West", industry: "Music", marketNPSI: 50.06,
    followers: { tiktok: 0, x: 32_000_000, instagram: 21_000_000, youtube: 6_000_000 },
    query: "Kanye West",
    snippets: [
      "Kanye West faces widespread condemnation after offensive remarks, brands cut ties",
      "Kanye West's album divides critics, some call it brilliant others a disaster",
      "Ye sparks outrage again, controversy overshadows the music",
    ],
  },
  {
    id: "ronaldo", name: "Cristiano Ronaldo", industry: "Sports", marketNPSI: 47.63,
    followers: { tiktok: 60_000_000, x: 113_000_000, instagram: 640_000_000, youtube: 76_000_000 },
    query: "Cristiano Ronaldo",
    snippets: [
      "Cristiano Ronaldo scores a stunning winner, hailed as a legendary performance",
      "Ronaldo's brilliant form earns glowing praise from fans worldwide",
      "Cristiano Ronaldo breaks another all-time scoring record, an incredible feat",
    ],
  },
  {
    id: "swift", name: "Taylor Swift", industry: "Music", marketNPSI: 46.31,
    followers: { tiktok: 24_000_000, x: 95_000_000, instagram: 283_000_000, youtube: 60_000_000 },
    query: "Taylor Swift",
    snippets: [
      "Taylor Swift's tour shatters box office records, a triumphant global success",
      "Fans overjoyed as Taylor Swift announces a surprise album to rave reviews",
      "Taylor Swift named most influential artist of the year, a wonderful honor",
    ],
  },
  {
    id: "mrbeast", name: "MrBeast", industry: "Influencers", marketNPSI: 46.21,
    followers: { tiktok: 114_000_000, x: 34_000_000, instagram: 65_000_000, youtube: 330_000_000 },
    query: "MrBeast",
    snippets: [
      "MrBeast breaks another record with his most-watched video ever, fans celebrate",
      "MrBeast donates millions to charity in a stunning philanthropy push",
      "Critics question MrBeast's production costs but audience love keeps growing",
    ],
  },
  {
    id: "mars", name: "Bruno Mars", industry: "Music", marketNPSI: 45.13,
    followers: { tiktok: 5_000_000, x: 41_000_000, instagram: 24_000_000, youtube: 38_000_000 },
    query: "Bruno Mars",
    snippets: [
      "Bruno Mars delivers a spectacular sold-out show, audiences thrilled",
      "Bruno Mars's new collaboration is a smash hit, critics delighted",
      "Bruno Mars praised for flawless live vocals, a joyful performance",
    ],
  },
  {
    id: "therock", name: "Dwayne Johnson", industry: "Film and TV", marketNPSI: 44.35,
    followers: { tiktok: 78_000_000, x: 16_000_000, instagram: 393_000_000, youtube: 6_000_000 },
    query: "Dwayne Johnson The Rock",
    snippets: [
      "Dwayne Johnson's new film opens strong, fans enjoy the charming performance",
      "The Rock's latest project draws mixed reviews, some critics disappointed",
      "Dwayne Johnson praised for generous charity work, an inspiring gesture",
    ],
  },
  {
    id: "obama", name: "Barack Obama", industry: "Politics", marketNPSI: 42.85,
    followers: { tiktok: 0, x: 131_000_000, instagram: 38_000_000, youtube: 700_000 },
    query: "Barack Obama",
    snippets: [
      "Obama's speech is warmly received, supporters praise the hopeful message",
      "Barack Obama's memoir earns glowing reviews and strong sales",
      "Obama criticized by opponents but remains widely admired in polls",
    ],
  },
  {
    id: "rdj", name: "Robert Downey Jr.", industry: "Film and TV", marketNPSI: 42.59,
    followers: { tiktok: 0, x: 21_000_000, instagram: 60_000_000, youtube: 0 },
    query: "Robert Downey Jr",
    snippets: [
      "Robert Downey Jr. wins an award for a brilliant, moving performance",
      "Downey's return to the franchise thrills fans, excitement is enormous",
      "Robert Downey Jr. praised by co-stars as generous and inspiring",
    ],
  },
  {
    id: "vance", name: "JD Vance", industry: "Politics", marketNPSI: 42.39,
    followers: { tiktok: 1_200_000, x: 4_500_000, instagram: 2_300_000, youtube: 180_000 },
    query: "JD Vance",
    snippets: [
      "JD Vance's remarks draw sharp criticism, opponents push back hard",
      "Vance defends his record amid mounting scrutiny and debate",
      "Supporters praise Vance's speech while critics call it divisive",
    ],
  },
  {
    id: "chalamet", name: "Timothée Chalamet", industry: "Film and TV", marketNPSI: 40.06,
    followers: { tiktok: 0, x: 3_100_000, instagram: 20_000_000, youtube: 0 },
    query: "Timothée Chalamet",
    snippets: [
      "Timothée Chalamet dazzles critics with a superb, magnetic performance",
      "Chalamet's new film earns rave reviews and awards buzz",
      "Timothée Chalamet charms audiences at the premiere, fans delighted",
    ],
  },
  {
    id: "rihanna", name: "Rihanna", industry: "Music", marketNPSI: 38.54,
    followers: { tiktok: 5_000_000, x: 108_000_000, instagram: 151_000_000, youtube: 45_000_000 },
    query: "Rihanna",
    snippets: [
      "Rihanna's Fenty empire posts blockbuster results, a stunning success",
      "Rihanna teases new music, fans absolutely ecstatic",
      "Rihanna celebrated for her inclusive brand, glowing coverage",
    ],
  },
  {
    id: "drake", name: "Drake", industry: "Music", marketNPSI: 38.43,
    followers: { tiktok: 18_000_000, x: 39_000_000, instagram: 143_000_000, youtube: 30_000_000 },
    query: "Drake",
    snippets: [
      "Drake's new album tops the charts, fans thrilled with the release",
      "Drake loses a bitter public feud, critics mock the response",
      "Drake's record-breaking streams impress the industry",
    ],
  },
  {
    id: "zuckerberg", name: "Mark Zuckerberg", industry: "Business", marketNPSI: 38.17,
    followers: { tiktok: 0, x: 5_000_000, instagram: 15_000_000, youtube: 200_000 },
    query: "Mark Zuckerberg",
    snippets: [
      "Zuckerberg faces tough questions over privacy failures, critics condemn the company",
      "Mark Zuckerberg announces strong earnings, investors react positively",
      "Zuckerberg's new product launch met with skepticism and some ridicule",
    ],
  },
  {
    id: "holland", name: "Tom Holland", industry: "Film and TV", marketNPSI: 37.89,
    followers: { tiktok: 0, x: 7_000_000, instagram: 68_000_000, youtube: 1_500_000 },
    query: "Tom Holland",
    snippets: [
      "Tom Holland's charming performance wins over critics and fans alike",
      "Tom Holland praised for his candid, thoughtful interview",
      "Holland's new film is a box-office triumph, audiences delighted",
    ],
  },
  {
    id: "nolan", name: "Christopher Nolan", industry: "Film and TV", marketNPSI: 37.62,
    followers: { tiktok: 0, x: 0, instagram: 0, youtube: 0 },
    query: "Christopher Nolan director",
    snippets: [
      "Christopher Nolan's latest is a masterpiece, critics overwhelmingly impressed",
      "Nolan wins top directing honors, a richly deserved triumph",
      "Nolan's ambitious film praised as a stunning technical achievement",
    ],
  },
  {
    id: "zendaya", name: "Zendaya", industry: "Film and TV", marketNPSI: 36.14,
    followers: { tiktok: 3_000_000, x: 22_000_000, instagram: 184_000_000, youtube: 0 },
    query: "Zendaya",
    snippets: [
      "Zendaya dazzles at the premiere, critics shower praise on her performance",
      "Zendaya named to a power list, a brilliant year for the star",
      "Zendaya's new film opens to strong reviews and box-office success",
    ],
  },
  {
    id: "ishowspeed", name: "IShowSpeed", industry: "Influencers", marketNPSI: 35.07,
    followers: { tiktok: 39_000_000, x: 5_000_000, instagram: 22_000_000, youtube: 39_000_000 },
    query: "IShowSpeed",
    snippets: [
      "IShowSpeed's world tour streams draw massive, enthusiastic audiences",
      "IShowSpeed apologizes after a controversial clip sparks criticism",
      "Speed's energetic stream delights fans and breaks viewership records",
    ],
  },
  {
    id: "eminem", name: "Eminem", industry: "Music", marketNPSI: 34.17,
    followers: { tiktok: 9_000_000, x: 32_000_000, instagram: 40_000_000, youtube: 60_000_000 },
    query: "Eminem",
    snippets: [
      "Eminem's surprise album impresses critics, fans call it a triumphant return",
      "Eminem honored for a legendary career, widely celebrated",
      "Some critics find the new record uneven, but fans remain enthusiastic",
    ],
  },
  {
    id: "messi", name: "Lionel Messi", industry: "Sports", marketNPSI: 33.73,
    followers: { tiktok: 17_000_000, x: 44_000_000, instagram: 505_000_000, youtube: 2_000_000 },
    query: "Lionel Messi",
    snippets: [
      "Messi's magical performance wins the match, fans in awe",
      "Lionel Messi wins another major honor, a spectacular achievement",
      "Messi praised as the greatest of all time after a brilliant display",
    ],
  },
  {
    id: "kai-cenat", name: "Kai Cenat", industry: "Influencers", marketNPSI: 27.54,
    followers: { tiktok: 22_000_000, x: 3_400_000, instagram: 9_000_000, youtube: 8_600_000 },
    query: "Kai Cenat",
    snippets: [
      "Kai Cenat smashes the subscriber record, an electrifying achievement",
      "Kai Cenat's marathon stream delights a massive, loyal audience",
      "Kai Cenat wins streamer of the year, richly deserved praise",
    ],
  },
  {
    id: "cobratate", name: "Andrew Tate", industry: "Influencers", marketNPSI: 18.91,
    followers: { tiktok: 0, x: 10_500_000, instagram: 0, youtube: 1_400_000 },
    query: "Andrew Tate",
    snippets: [
      "Andrew Tate faces serious legal charges, widespread condemnation follows",
      "Andrew Tate banned from a platform amid controversy and backlash",
      "Tate's remarks spark outrage, critics denounce the influencer",
    ],
  },
  {
    id: "pewdiepie", name: "PewDiePie", industry: "Influencers", marketNPSI: 14.83,
    followers: { tiktok: 0, x: 19_000_000, instagram: 21_000_000, youtube: 111_000_000 },
    query: "PewDiePie",
    snippets: [
      "PewDiePie returns with a heartfelt video, longtime fans overjoyed",
      "PewDiePie shares happy family news, the community celebrates",
      "PewDiePie's charity milestone praised across the platform",
    ],
  },

  // ---------- IPO candidates: not yet listed on pauv ----------
  {
    id: "cand-ava-nakamura", name: "Ava Nakamura", industry: "Influencers", marketNPSI: null,
    followers: { tiktok: 8_400_000, x: 640_000, instagram: 3_900_000, youtube: 2_100_000 },
    query: "Ava Nakamura creator",
    snippets: [
      "Rising star Ava Nakamura wins new fans with a delightful viral series",
      "Ava Nakamura lands a brand partnership, an exciting breakout moment",
      "Ava Nakamura praised for creative, uplifting content",
    ],
  },
  {
    id: "cand-marcus-bell", name: "Marcus Bell", industry: "Sports", marketNPSI: null,
    followers: { tiktok: 1_100_000, x: 2_300_000, instagram: 6_800_000, youtube: 420_000 },
    query: "Marcus Bell athlete",
    snippets: [
      "Marcus Bell stuns with a breakout rookie performance, scouts impressed",
      "Marcus Bell named a rising talent to watch, fans excited",
      "Marcus Bell overcomes an injury setback, an inspiring comeback",
    ],
  },
  {
    id: "cand-lena-cruz", name: "Lena Cruz", industry: "Music", marketNPSI: null,
    followers: { tiktok: 14_000_000, x: 900_000, instagram: 7_200_000, youtube: 5_400_000 },
    query: "Lena Cruz singer",
    snippets: [
      "Lena Cruz's debut single becomes a surprise smash hit, critics enchanted",
      "Lena Cruz sells out her first tour instantly, overwhelming fan love",
      "Lena Cruz hailed as the year's most promising new voice",
    ],
  },
  {
    id: "cand-dana-ford", name: "Senator Dana Ford", industry: "Politics", marketNPSI: null,
    followers: { tiktok: 320_000, x: 4_100_000, instagram: 1_800_000, youtube: 210_000 },
    query: "Senator Dana Ford",
    snippets: [
      "Senator Dana Ford's bill sparks fierce debate, opponents push back hard",
      "Dana Ford criticized over a controversial vote, protests planned",
      "Ford defends her record amid mounting criticism and scrutiny",
    ],
  },
  {
    id: "cand-priya-anand", name: "Priya Anand", industry: "Business", marketNPSI: null,
    followers: { tiktok: 90_000, x: 3_600_000, instagram: 780_000, youtube: 610_000 },
    query: "Priya Anand founder startup",
    snippets: [
      "Priya Anand's startup raises a huge round, investors thrilled by the vision",
      "Priya Anand praised as a visionary founder, a glowing profile published",
      "Anand's product launch is a resounding success, users delighted",
    ],
  },
  {
    id: "cand-theo-marsh", name: "Theo Marsh", industry: "Comedy", marketNPSI: null,
    followers: { tiktok: 6_700_000, x: 1_200_000, instagram: 4_400_000, youtube: 3_300_000 },
    query: "Theo Marsh comedian",
    snippets: [
      "Theo Marsh's special earns huge laughs and warm reviews",
      "Theo Marsh goes viral with a hilarious sketch, fans in stitches",
      "Some jokes miss for critics, but Theo Marsh's crowd adores him",
    ],
  },
  {
    id: "cand-nadia-rossi", name: "Chef Nadia Rossi", industry: "Food", marketNPSI: null,
    followers: { tiktok: 4_200_000, x: 410_000, instagram: 5_100_000, youtube: 1_900_000 },
    query: "Chef Nadia Rossi",
    snippets: [
      "Chef Nadia Rossi's viral recipes delight home cooks, a tasty phenomenon",
      "Nadia Rossi opens an acclaimed new restaurant to glowing reviews",
      "Rossi praised for an approachable, joyful cooking style",
    ],
  },
  {
    id: "cand-riko", name: "Riko", industry: "Gaming", marketNPSI: null,
    followers: { tiktok: 3_800_000, x: 1_600_000, instagram: 2_200_000, youtube: 6_100_000 },
    query: "Riko streamer",
    snippets: [
      "Riko's clutch tournament win electrifies the community, fans roar",
      "Riko breaks a viewership record, an exciting milestone for the streamer",
      "Riko celebrated for a positive, welcoming stream culture",
    ],
  },
];
