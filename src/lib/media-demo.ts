import interstellar from "@/assets/media/interstellar.jpg.asset.json";
import inception from "@/assets/media/inception.jpg.asset.json";
import breakingBad from "@/assets/media/breaking-bad.jpg.asset.json";
import lastOfUs from "@/assets/media/last-of-us.jpg.asset.json";
import type { MediaDetail } from "./media";
const base = { inLibrary: false, imdbRating: null, runtime: null, images: [], trailers: [], demo: true, notice: "Bemutató adatlap · az aktuális értékelésekhez és további filmadatokhoz csatlakoztatott szolgáltatás szükséges." };
export const mediaDemo: MediaDetail[] = [
  { ...base, id: 157336, tmdbId: 157336, title: "Interstellar", type: "Film", year: 2014, poster: interstellar.url, imdbId: "tt0816692", genres: ["Sci-fi", "Dráma"], runtime: 169,
    overview: "A Föld lassan lakhatatlanná válik. Egy korábbi pilóta egy kutatócsoporttal féregjáraton keresztül indul új otthont keresni az emberiségnek, miközben hátrahagyja a családját.",
    cast: [{ name: "Matthew McConaughey", character: "Cooper", photo: "" }, { name: "Anne Hathaway", character: "Amelia Brand", photo: "" }, { name: "Jessica Chastain", character: "Murph", photo: "" }] },
  { ...base, id: 27205, tmdbId: 27205, title: "Inception", type: "Film", year: 2010, poster: inception.url, imdbId: "tt1375666", genres: ["Sci-fi", "Thriller"], runtime: 148,
    overview: "Dom Cobb mások álmaiból lop titkokat. Egy különleges megbízás során azonban nem elvennie kell egy gondolatot, hanem elültetnie azt — egyre mélyebb álomrétegekben.",
    cast: [{ name: "Leonardo DiCaprio", character: "Dom Cobb", photo: "" }, { name: "Joseph Gordon-Levitt", character: "Arthur", photo: "" }, { name: "Elliot Page", character: "Ariadne", photo: "" }] },
  { ...base, id: 81189, tmdbId: 1396, title: "Breaking Bad", type: "Sorozat", year: 2008, poster: breakingBad.url, imdbId: "tt0903747", genres: ["Krimi", "Dráma"],
    overview: "Egy súlyosan beteg kémiatanár a családja jövőjét próbálja biztosítani. Egykori diákjával együtt a kábítószer-kereskedelem világába lép, döntései pedig egyre súlyosabb következményekkel járnak.",
    cast: [{ name: "Bryan Cranston", character: "Walter White", photo: "" }, { name: "Aaron Paul", character: "Jesse Pinkman", photo: "" }, { name: "Anna Gunn", character: "Skyler White", photo: "" }] },
  { ...base, id: 392256, tmdbId: 100088, title: "The Last of Us", type: "Sorozat", year: 2023, poster: lastOfUs.url, imdbId: "tt3581920", genres: ["Dráma", "Kaland"],
    overview: "Egy világméretű fertőzés után Joel egy fiatal lányt kísér át a veszélyes Amerikán. Az út során a túlélésért folytatott küzdelem mellett egymáshoz is egyre közelebb kerülnek.",
    cast: [{ name: "Pedro Pascal", character: "Joel Miller", photo: "" }, { name: "Bella Ramsey", character: "Ellie Williams", photo: "" }] },
];