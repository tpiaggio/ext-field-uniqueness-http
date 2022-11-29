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
  hashField: process.env.HASH_FIELD || "",
};

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
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated.',
    );
  }
  const {change, collection, fieldName} = data;
  if (!(typeof change === 'string') || change.length === 0) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'The function must be called with one argument "change" containing the type of change to execute.'
    );
  }
  const regex = new RegExp("^[^/]+(/[^/]+/[^/]+)*$");
  if (!(typeof collection === 'string') || collection.length === 0 || !regex.test(collection)) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'The function must be called with one argument "collection" containing a valid Firestore collection.'
    );
  }
  if (!(typeof fieldName === 'string') || fieldName.length === 0 || !regex.test(fieldName)) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'The function must be called with one argument "fieldName" containing a valid Firestore field.'
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

const collection = (data: Data) => admin.firestore().collection(data.collection);
const auxCollection = (data: Data) => admin.firestore().collection(data.collection + "-" + data.fieldName);

const extractUniqueField = (data: Data): string => {
  const field = data.document[data.fieldName];
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
      const doc = await t.get(auxCollection(data).doc(uniqueField));
      if(doc.exists) {
        throw new functions.https.HttpsError(
          'already-exists', 
          'Document with unique field already exists.'
        );
      } else {
        t.set(
          collection(data).doc(data.document.id), 
          data.document
        ).set(
          auxCollection(data).doc(uniqueField), 
          {id: data.document.id, [data.fieldName]: data.document[data.fieldName]}
        );
        functions.logger.log('Document created with unique field');
      }
    });
  } else {
    await collection(data).doc(data.document.id).set(data.document);
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
      collection(data).doc(data.document.id)
    ).delete(
      auxCollection(data).doc(uniqueField)
    );
    await batch.commit();
    functions.logger.log('Document deleted with unique field');
  } else {
    await collection(data).doc(data.document.id).delete();
    functions.logger.log('Document deleted without unique field');
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
    functions.logger.log('Document updated without unique field');
  }

  await admin.firestore().runTransaction(async (t) => {
    const doc = await t.get(auxCollection(data).doc(uniqueFieldAfter));
    if(doc.exists) {
      throw new functions.https.HttpsError(
        'already-exists', 
        'Document with unique field already exists.'
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
      functions.logger.log('Document updated with unique field');
    }
  });
};