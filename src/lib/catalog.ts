import booksFile from "@/data/books.json";
import librariesFile from "@/data/libraries.json";
import { decodeEntities } from "@/lib/text";
import type { BooksFile, LibrariesFile, Stop } from "@/lib/types";

const rawLibraries = librariesFile as LibrariesFile;
const rawBooks = booksFile as BooksFile;

/** Imported names carry HTML entities in a couple of places; decode once at load. */
export const libraries: LibrariesFile = {
  ...rawLibraries,
  stops: rawLibraries.stops.map((stop) => ({
    ...stop,
    name: decodeEntities(stop.name),
    address: decodeEntities(stop.address),
    notes: decodeEntities(stop.notes),
  })),
};

export const books: BooksFile = {
  ...rawBooks,
  books: rawBooks.books.map((book) => ({
    ...book,
    title: decodeEntities(book.title),
    author: decodeEntities(book.author),
  })),
};

export const bookcases: Stop[] = libraries.stops.filter((stop) => stop.profitEligible);
export const mutualAid: Stop[] = libraries.stops.filter((stop) => !stop.profitEligible);

export const CIVIC_CENTER = { lat: 39.73915, lon: -104.9903, label: "Civic Center" };
