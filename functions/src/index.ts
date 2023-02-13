import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { getExtensions } from "firebase-admin/extensions";
import { getFunctions } from "firebase-admin/functions";

import * as md5 from "md5";

enum ChangeType {
  CREATE,
  DELETE,
  UPDATE,
  INVALID,
}

const config = {
  location: process.env.LOCATION || "",
  requireAuth: process.env.REQUIRE_AUTH || "",
  hashField: process.env.HASH_FIELD || "",
  backfillCollection: process.env.BACKFILL_COLLECTION || "",
  backfillFieldName: process.env.BACKFILL_FIELD_NAME || "",
};

const DOCS_PER_BACKFILL = 250;

type Data = {
  change: string,
  collection: string,
  fieldName: string,
  document: {
    id: string,
    [fieldName: string]: string
  }
}

admin.initializeApp();

exports.fieldUniqueness =  functions.handler.https.onCall(async (data: Data, context) => {
  if (!context.auth && config.requireAuth === "yes") {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated.",
    );
  }
  const {change, collection, fieldName} = data;
  if (!(typeof change === "string") || change.length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument", 
      "The function must be called with one argument \"change\" containing the type of change to execute."
    );
  }
  const regex = new RegExp("^[^/]+(/[^/]+/[^/]+)*$");
  if (!(typeof collection === "string") || collection.length === 0 || !regex.test(collection)) {
    throw new functions.https.HttpsError(
      "invalid-argument", 
      "The function must be called with one argument \"collection\" containing a valid Firestore collection."
    );
  }
  if (!(typeof fieldName === "string") || fieldName.length === 0 || !regex.test(fieldName)) {
    throw new functions.https.HttpsError(
      "invalid-argument", 
      "The function must be called with one argument \"fieldName\" containing a valid Firestore field."
    );
  }
  const changeType = getChangeType(data.change);
  if (changeType === ChangeType.INVALID) {
    throw new functions.https.HttpsError(
      "invalid-argument", 
      "The value of the argument \"change\" is not valid."
    );
  }
  functions.logger.log("Started execution of Field Uniqueness extension");
  switch (changeType) {
    case ChangeType.CREATE:
      await handleCreateDocument(data);
      break;
    case ChangeType.DELETE:
      await handleDeleteDocument(data);
      break;
    case ChangeType.UPDATE:
      await handleUpdateDocument(data);
      break;
  }
  functions.logger.log("Completed execution of Field Uniqueness extension");
  return {
    message: "Document written with unique field"
  };
});

const collection = (data: Data) => admin.firestore().collection(data.collection);
const auxCollection = (data: Data) => admin.firestore().collection(data.collection + "-" + data.fieldName);

const extractUniqueField = (data: Data): string => {
  const field = data.document[data.fieldName];
  return (field && config.hashField === "yes") ? md5(field) : field;
};

const getChangeType = (
  change: string
): ChangeType => {
  if (change === "DELETE") {
    return ChangeType.DELETE;
  }
  if (change === "CREATE") {
    return ChangeType.CREATE;
  }
  if (change === "UPDATE") {
    return ChangeType.UPDATE;
  }
  return ChangeType.INVALID;
};

const handleCreateDocument = async (
  data: Data,
): Promise<void> => {
  const uniqueField = extractUniqueField(data);
  if (uniqueField) {
    await admin.firestore().runTransaction(async (t) => {
      const doc = await t.get(auxCollection(data).doc(uniqueField));
      if(doc.exists) {
        throw new functions.https.HttpsError(
          "already-exists", 
          "Document with unique field already exists."
        );
      } else {
        t.set(
          collection(data).doc(data.document.id), 
          data.document
        ).set(
          auxCollection(data).doc(uniqueField), 
          {id: data.document.id, [data.fieldName]: data.document[data.fieldName]}
        );
        functions.logger.log("Document created with unique field");
      }
    });
  } else {
    await collection(data).doc(data.document.id).set(data.document);
    functions.logger.log("Document created without unique field");
  }
};

const handleDeleteDocument = async (
  data: Data,
): Promise<void> => {
  const uniqueField = extractUniqueField(data);
  if (uniqueField) {
    const batch = admin.firestore().batch();
    batch.delete(
      collection(data).doc(data.document.id)
    ).delete(
      auxCollection(data).doc(uniqueField)
    );
    await batch.commit();
    functions.logger.log("Document deleted with unique field");
  } else {
    await collection(data).doc(data.document.id).delete();
    functions.logger.log("Document deleted without unique field");
  }
};

const handleUpdateDocument = async (
  data: Data
): Promise<void> => {
  const beforeDoc = await collection(data).doc(data.document.id).get();
  const beforeData: Data = {
    ...data,
    document: {id: data.document.id, [data.fieldName]: beforeDoc.get(data.fieldName)} 
  };
  const uniqueFieldBefore = extractUniqueField(beforeData);
  const uniqueFieldAfter = extractUniqueField(data);

  // If previous and updated documents have no unique field, or
  // If unique field from previous and updated documents didn't change
  if ((uniqueFieldBefore === undefined && uniqueFieldAfter === undefined) || 
    (uniqueFieldBefore === uniqueFieldAfter)) {
    await collection(data).doc(data.document.id).update(data.document);
    functions.logger.log("Document updated without unique field");
    return;
  }

  await admin.firestore().runTransaction(async (t) => {
    const doc = await t.get(auxCollection(data).doc(uniqueFieldAfter));
    if(doc.exists) {
      throw new functions.https.HttpsError(
        "already-exists", 
        "Document with unique field already exists."
      );
    } else {
      if (uniqueFieldBefore) {
        t.delete(auxCollection(data).doc(uniqueFieldBefore));
      }
      t.update(
        collection(data).doc(data.document.id), 
        data.document
      ).set(
        auxCollection(data).doc(uniqueFieldAfter), 
        {id: data.document.id, [data.fieldName]: data.document[data.fieldName]}
      );
      functions.logger.log("Document updated with unique field");
    }
  });
};

const handleExistingDocument = async (
  data: Data,
  bulkWriter: admin.firestore.BulkWriter
): Promise<void> => {
  const uniqueField = extractUniqueField(data);
  try {
    if (uniqueField) {
      const auxDoc = await auxCollection(data).doc(uniqueField).get();
      if(auxDoc.exists) {
        if (auxDoc.get("id") !== data.document.id) {
          // if the ids don't match, it means it's a duplicate
          await bulkWriter.update(
            auxDoc.ref,
            {duplicate: true}
          );
          const message = `Document with unique field already existed, document with field ${config.backfillFieldName} with value ${uniqueField} in ${config.backfillCollection} collection is duplicated`;

          functions.logger.log(message);
        }
      } else {
        await bulkWriter.set(
          auxDoc.ref,
          {id: data.document.id, [config.backfillFieldName]: data.document[config.backfillFieldName]}
        );
      }
    } else {
      functions.logger.log("Document without unique field, no processing is required");
    }
  } catch (err) {
    functions.logger.log(`Error executing Field Uniqueness backfill with ${config.backfillCollection}: ${uniqueField}`, err);
    throw err;
  }
};

export const fieldUniquenessBackfill = functions.tasks
  .taskQueue()
  .onDispatch(async (data: any) => {
    const runtime = getExtensions().runtime();
    if (!config.backfillCollection || !config.backfillFieldName) {
      await runtime.setProcessingState(
        "PROCESSING_COMPLETE",
        "Existing documents were not checked for uniqueness because there is no backfill collection or backfill field name configured. " +
          "If you want to fill in missing checks, reconfigure this instance."
      );
      return;
    }
    const offset = (data["offset"] as number) ?? 0;
    const pastSuccessCount = (data["successCount"] as number) ?? 0;
    const pastErrorCount = (data["errorCount"] as number) ?? 0;
    // We also track the start time of the first invocation, so that we can report the full length at the end.
    const startTime = (data["startTime"] as number) ?? Date.now();

    const snapshot = await admin
      .firestore()
      .collection(config.backfillCollection)
      .offset(offset)
      .limit(DOCS_PER_BACKFILL)
      .get();
    // Since we will be writing many docs to Firestore, use a BulkWriter for better performance.
    const writer = admin.firestore().bulkWriter();
    const documentsChecked = await Promise.allSettled(
      snapshot.docs.map((doc) => {
        const docData = doc.data() as FirebaseFirestore.DocumentData;
        const data: Data = {
          change: "CREATE",
          collection: config.backfillCollection,
          fieldName: config.backfillFieldName,
          document: {
            id: doc.id,
            [config.backfillFieldName]: docData[config.backfillFieldName]
          }
        };
        return handleExistingDocument(data, writer);
      })
    );
    // Close the writer to commit the changes to Firestore.
    await writer.close();
    const newSuccessCount =
      pastSuccessCount +
      documentsChecked.filter((p) => p.status === "fulfilled").length;
    const newErrorCount =
      pastErrorCount +
      documentsChecked.filter((p) => p.status === "rejected").length;

    if (snapshot.size == DOCS_PER_BACKFILL) {
      // Stil have more documents to check uniqueness, enqueue another task.
      functions.logger.log(`Enqueue next: ${(offset + DOCS_PER_BACKFILL)}`);
      const queue = getFunctions().taskQueue(
        "fieldUniquenessBackfill",
        process.env.EXT_INSTANCE_ID
      );
      await queue.enqueue({
        offset: offset + DOCS_PER_BACKFILL,
        successCount: newSuccessCount,
        errorCount: newErrorCount,
        startTime: startTime,
      });
    } else {
      // No more documents to check uniqueness for, time to set the processing state.
      functions.logger.log(`Backfill complete. Success count: ${newSuccessCount}, Error count: ${newErrorCount}`);
      if (newErrorCount == 0) {
        return await runtime.setProcessingState(
          "PROCESSING_COMPLETE",
          `Successfully checked uniqueness for ${newSuccessCount} documents in ${
            Date.now() - startTime
          }ms.`
        );
      } else if (newErrorCount > 0 && newSuccessCount > 0) {
        return await runtime.setProcessingState(
          "PROCESSING_WARNING",
          `Successfully checked uniqueness for ${newSuccessCount} documents, ${newErrorCount} errors in ${
            Date.now() - startTime
          }ms. See function logs for specific error messages.`
        );
      }
      return await runtime.setProcessingState(
        "PROCESSING_FAILED",
        `Successfully checked uniqueness for ${newSuccessCount} documents, ${newErrorCount} errors in ${
          Date.now() - startTime
        }ms. See function logs for specific error messages.`
      );
    }
  });
