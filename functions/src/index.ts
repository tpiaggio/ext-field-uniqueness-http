import * as admin from "firebase-admin";
import * as functions from 'firebase-functions';

import * as md5 from 'md5';

enum ChangeType {
  CREATE,
  DELETE,
  UPDATE,
}

const config = {
  location: process.env.LOCATION || "",
  collection: process.env.COLLECTION_PATH || "",
  fieldName: process.env.FIELD_NAME || "",
  hashField: process.env.HASH_FIELD || "",
  auxCollection: process.env.AUX_COLLECTION_PATH || "",
};

type Data = {
  change: string,
  document: {
    id: string,
    [fieldName: string]: string
  }
}

admin.initializeApp();

exports.fieldUniqueness =  functions.handler.https.onCall(async (data: Data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated.',
    );
  }
  if (!(typeof data.change === 'string') || data.change.length === 0) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'The function must be called with one argument "change" containing the type of change to execute.'
    );
  }
  const changeType = getChangeType(data.change);
  functions.logger.log('Started execution of Field Uniqueness extension');
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
  functions.logger.log('Completed execution of Field Uniqueness extension');
  return {
    message: "Document written with unique field"
  };
});

const collection = admin.firestore().collection(config.collection);
const auxCollection = admin.firestore().collection(config.auxCollection);

const extractUniqueField = (data: Data): string => {
  const field = data.document[config.fieldName];
  return (field && config.hashField === 'yes') ? md5(field) : field;
};

const getChangeType = (
  change: string
): ChangeType => {
  if (change === 'DELETE') {
    return ChangeType.DELETE;
  }
  if (change === 'CREATE') {
    return ChangeType.CREATE;
  }
  return ChangeType.UPDATE;
};

const handleCreateDocument = async (
  data: Data,
): Promise<void> => {
  const uniqueField = extractUniqueField(data);
  if (uniqueField) {
    await admin.firestore().runTransaction(async (t) => {
      const doc = await t.get(auxCollection.doc(uniqueField));
      if(doc.exists) {
        throw new functions.https.HttpsError(
          'already-exists', 
          'Document with unique field already exists.'
        );
      } else {
        t.set(
          collection.doc(data.document.id), 
          data.document
        ).set(
          auxCollection.doc(uniqueField), 
          {id: data.document.id, [config.fieldName]: data.document[config.fieldName]}
        );
        functions.logger.log('Document created with unique field');
      }
    });
  } else {
    await collection.doc(data.document.id).set(data.document);
    functions.logger.log('Document created without unique field');
  }
};

const handleDeleteDocument = async (
  data: Data,
): Promise<void> => {
  const uniqueField = extractUniqueField(data);
  if (uniqueField) {
    const batch = admin.firestore().batch();
    batch.delete(
      collection.doc(data.document.id)
    ).delete(
      auxCollection.doc(uniqueField)
    );
    await batch.commit();
    functions.logger.log('Document deleted with unique field');
  } else {
    await collection.doc(data.document.id).delete();
    functions.logger.log('Document deleted without unique field');
  }
};

const handleUpdateDocument = async (
  data: Data
): Promise<void> => {
  const beforeDoc = await collection.doc(data.document.id).get();
  const beforeData: Data = {
    change: 'DELETE', 
    document: {id: data.document.id, [config.fieldName]: beforeDoc.get(config.fieldName)} 
  };
  const uniqueFieldBefore = extractUniqueField(beforeData);
  const uniqueFieldAfter = extractUniqueField(data);

  // If previous and updated documents have no unique field, or
  // If unique field from previous and updated documents didn't change
  if ((uniqueFieldBefore === undefined && uniqueFieldAfter === undefined) || 
    (uniqueFieldBefore === uniqueFieldAfter)) {
    await collection.doc(data.document.id).update(data.document);
    functions.logger.log('Document updated without unique field');
  }

  await admin.firestore().runTransaction(async (t) => {
    const doc = await t.get(auxCollection.doc(uniqueFieldAfter));
    if(doc.exists) {
      throw new functions.https.HttpsError(
        'already-exists', 
        'Document with unique field already exists.'
      );
    } else {
      if (uniqueFieldBefore) {
        t.delete(auxCollection.doc(uniqueFieldBefore));
      }
      t.update(
        collection.doc(data.document.id), 
        data.document
      ).set(
        auxCollection.doc(uniqueFieldAfter), 
        {id: data.document.id, [config.fieldName]: data.document[config.fieldName]}
      );
      functions.logger.log('Document updated with unique field');
    }
  });
};