import * as admin from "firebase-admin";
import { UserRecord } from "firebase-functions/v1/auth";
import setupEnvironment from './helpers/setupEnvironment';
import setupExtension from './helpers/setupExtension';

const fft = require('firebase-functions-test')();

admin.initializeApp({
 projectId: "demo-test",
});
setupEnvironment();
setupExtension();

/**
 * Test functions will try to initialize app
 * This is because admin.initializeApp() is called in the index file
 * Use this mock to stop the app from being initialized in the test fn
*/

jest.spyOn(admin, 'initializeApp').mockImplementation();

import * as funcs from '../src/index';
import { Data } from "../src/utils";
import { waitForDocumentDelete, waitForDocumentToExistInCollection } from "./helpers";

/** prepare extension functions */
const fieldUniquenessFn = fft.wrap(funcs.fieldUniqueness);

const auth = admin.auth();

describe("extension", () => {
  const db = admin.firestore();

  let user: UserRecord;

  let data: Data = {
    change: "",
    collection: "",
    fieldName: "",
    document: {
      id: ""
    }
  };

  beforeEach(async () => {
    /** create example user */
    user = await auth.createUser({});
  });

  test("user gets created", () => {
    expect(!!user).toBe(true);
  });

  test('will throw an error with no authentication provided', () => {
    expect(fieldUniquenessFn.call({}, {}, {})).rejects.toThrowError(
      'User must be authenticated.',
    );
  });

  test('will throw an error if arguments are not valid', () => {
    // no argument 'change'
    expect(fieldUniquenessFn.call({}, data, { auth: { uid: user.uid } })).rejects.toThrowError(
      "The function must be called with one argument \"change\" containing the type of change to execute.",
    );

    data.change = "INVALID";
    // no valid argument 'change'
    expect(fieldUniquenessFn.call({}, data, { auth: { uid: user.uid } })).rejects.toThrowError(
      "The value of the argument \"change\" is not valid.",
    );

    data.change = "CREATE";
    // no valid argument 'collection'
    expect(fieldUniquenessFn.call({}, data, { auth: { uid: user.uid } })).rejects.toThrowError(
      "The function must be called with one argument \"collection\" containing a valid Firestore collection.",
    );

    data.collection = "users";
    // no valid argument 'fieldName'
    expect(fieldUniquenessFn.call({}, data, { auth: { uid: user.uid } })).rejects.toThrowError(
      "The function must be called with one argument \"fieldName\" containing a valid Firestore field.",
    );
  });

  test('will create documents in collections', async () => {
    data = {
      change: "CREATE",
      collection: "users",
      fieldName: "username",
      document: {
        id: "123",
        username: "johnDoe",
      }
    };
    //creates new user in the db with aux document as well
    await fieldUniquenessFn.call({}, data, { auth: { uid: user.uid } });
    const johnDoe = await waitForDocumentToExistInCollection(db.collection("users"), "username", "johnDoe");
    const johnDoeAux = await waitForDocumentToExistInCollection(db.collection("users-username"), "username", "johnDoe");

    expect(johnDoe.doc.data()).toEqual({ id: "123", username: "johnDoe" });
    expect(johnDoeAux.doc.data()).toEqual({ id: "123", username: "johnDoe" });

    // if same value gets created again, throws an error
    expect(fieldUniquenessFn.call({}, data, { auth: { uid: user.uid } })).rejects.toThrowError(
      "Document with unique field already exists.",
    );

    //create new user on db for testing purposes
    data.document = {
      id: "456",
      username: "janeDoe"
    };
    await fieldUniquenessFn.call({}, data, { auth: { uid: user.uid } });
    const janeDoe = await waitForDocumentToExistInCollection(db.collection("users"), "username", "janeDoe");

    expect(janeDoe.doc.data()).toEqual({ id: "456", username: "janeDoe" });

    //clean db
    await Promise.all([
      db.collection("users").doc("123").delete(),
      db.collection("users-username").doc("johnDoe").delete(),
      db.collection("users").doc("456").delete(),
      db.collection("users-username").doc("janeDoe").delete(),
    ]);
  });

  test('will update documents in collections', async () => {
    data = {
      change: "UPDATE",
      collection: "users",
      fieldName: "username",
      document: {
        id: "123",
        username: "janeDoe",
      }
    };
    //creates user with username johnDoe in the db
    await Promise.all([
      db.collection("users").doc("123").set({ id: "123", username: "johnDoe" }),
      db.collection("users-username").doc("johnDoe").set({ id: "123", username: "johnDoe" }),
    ]);

    //updates username
    await fieldUniquenessFn.call({}, data, { auth: { uid: user.uid } });
    const johnDoeDeleted = await waitForDocumentDelete(db.collection("users-usernames").doc("johnDoe"));
    const janeDoe = await waitForDocumentToExistInCollection(db.collection("users"), "username", "janeDoe");
    const janeDoeAux = await waitForDocumentToExistInCollection(db.collection("users-username"), "username", "janeDoe");

    //updated doc in users collection, created new aux doc in aux collection, deleted old doc in aux collection
    expect(johnDoeDeleted.exists).toEqual(false);
    expect(janeDoe.doc.data()).toEqual({ id: "123", username: "janeDoe" });
    expect(janeDoeAux.doc.data()).toEqual({ id: "123", username: "janeDoe" });

    //clean db
    await Promise.all([
      db.collection("users").doc("123").delete(),
      db.collection("users-username").doc("janeDoe").delete(),
    ]);
  });

  test('will delete documents in collections', async () => {
    data = {
      change: "DELETE",
      collection: "users",
      fieldName: "username",
      document: {
        id: "123",
        username: "johnDoe",
      }
    };
    //creates user with username johnDoe in the db
    await Promise.all([
      db.collection("users").doc("123").set({ id: "123", username: "johnDoe" }),
      db.collection("users-username").doc("johnDoe").set({ id: "123", username: "johnDoe" }),
    ]);

    //deletes user
    await fieldUniquenessFn.call({}, data, { auth: { uid: user.uid } });
    const johnDoe = await waitForDocumentDelete(db.collection("users").doc("123"));
    const johnDoeAux = await waitForDocumentDelete(db.collection("users-usernames").doc("johnDoe"));

    //deletes doc in collection and in aux collection
    expect(johnDoe.exists).toEqual(false);
    expect(johnDoeAux.exists).toEqual(false);
  });
});