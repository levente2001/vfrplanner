import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore/lite";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";
import { getFirebaseServices } from "@/lib/firebase/client";
import type { Aircraft, AircraftDocument } from "./types";

function services(uid: string) {
  const value = getFirebaseServices();
  if (!value || value.auth.currentUser?.uid !== uid)
    throw new Error("Sign in to manage your aircraft.");
  return value;
}

export async function listAircraft(uid: string): Promise<Aircraft[]> {
  const { db } = services(uid);
  const snapshot = await getDocs(collection(db, "users", uid, "aircraft"));
  return snapshot.docs
    .map((item) => ({ ...item.data(), id: item.id }) as Aircraft)
    .sort((a, b) => a.registration.localeCompare(b.registration));
}

export async function saveAircraft(uid: string, aircraft: Aircraft) {
  const { db } = services(uid);
  await setDoc(doc(db, "users", uid, "aircraft", aircraft.id), {
    ...aircraft,
    updatedAt: new Date().toISOString(),
  });
}

export async function uploadAircraftDocument(
  uid: string,
  aircraft: Aircraft,
  file: File,
) {
  const { app } = services(uid);
  const extension = file.name.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    txt: "text/plain",
    csv: "text/csv",
  };
  if (!extension || !mimeTypes[extension])
    throw new Error("Upload PDF, PNG, JPG, TXT or CSV files.");
  if (!file.size || file.size > 150 * 1024 * 1024)
    throw new Error("Choose a non-empty file up to 150 MB.");
  const id = crypto.randomUUID();
  const storagePath = `users/${uid}/aircraft/${aircraft.id}/${id}.${extension}`;
  const location = ref(getStorage(app), storagePath);
  await uploadBytes(location, file, {
    contentType: mimeTypes[extension],
    contentDisposition: "attachment",
  });
  const document: AircraftDocument = {
    id,
    name: file.name,
    size: file.size,
    mimeType: mimeTypes[extension],
    uploadedAt: new Date().toISOString(),
    storagePath,
  };
  const updated = { ...aircraft, documents: [...aircraft.documents, document] };
  try {
    await saveAircraft(uid, updated);
  } catch (error) {
    await deleteObject(location).catch(() => undefined);
    throw error;
  }
  return updated;
}

export async function documentUrl(uid: string, document: AircraftDocument) {
  const { app } = services(uid);
  if (!document.storagePath.startsWith(`users/${uid}/aircraft/`))
    throw new Error("Document does not belong to this account.");
  return getDownloadURL(ref(getStorage(app), document.storagePath));
}

export async function removeAircraftDocument(
  uid: string,
  aircraft: Aircraft,
  document: AircraftDocument,
) {
  if (aircraft.profiles.some((profile) => profile.documentId === document.id))
    throw new Error(
      "Remove the performance profiles referencing this document first.",
    );
  const { app } = services(uid);
  await deleteObject(ref(getStorage(app), document.storagePath)).catch(
    (error: { code?: string }) => {
      if (error.code !== "storage/object-not-found") throw error;
    },
  );
  const updated = {
    ...aircraft,
    documents: aircraft.documents.filter((item) => item.id !== document.id),
  };
  await saveAircraft(uid, updated);
  return updated;
}

export async function removeAircraft(uid: string, aircraft: Aircraft) {
  const { db, app } = services(uid);
  for (const document of aircraft.documents) {
    await deleteObject(ref(getStorage(app), document.storagePath)).catch(
      (error: { code?: string }) => {
        if (error.code !== "storage/object-not-found") throw error;
      },
    );
  }
  await deleteDoc(doc(db, "users", uid, "aircraft", aircraft.id));
}

export function aircraftError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "permission-denied" || code === "storage/unauthorized")
    return "Your account cannot access aircraft storage yet. The Firebase aircraft access rules must be configured.";
  if (code === "storage/bucket-not-found" || code === "storage/unknown")
    return "Aircraft document storage is unavailable. Check the Firebase Storage bucket and access rules.";
  return error instanceof Error ? error.message : "Aircraft operation failed.";
}
