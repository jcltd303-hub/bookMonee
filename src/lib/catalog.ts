import booksFile from "@/data/books.json";
import librariesFile from "@/data/libraries.json";
import type { BooksFile, LibrariesFile, Stop } from "@/lib/types";

export const libraries = librariesFile as LibrariesFile;
export const books = booksFile as BooksFile;

export const bookcases: Stop[] = libraries.stops.filter((stop) => stop.profitEligible);
export const mutualAid: Stop[] = libraries.stops.filter((stop) => !stop.profitEligible);

export const CIVIC_CENTER = { lat: 39.73915, lon: -104.9903, label: "Civic Center" };
