# Field Uniqueness HTTP

**Author**: Tomas Piaggio (**[https://github.com/tpiaggio](https://github.com/tpiaggio)**)

**Description**: Ensures uniqueness on a specified field of a document written to a specified Cloud Firestore collection, using a HTTP Callable function.


**Details**: Use this extension to ensure uniqueness on a specified field (for example, username) of a document within a specified to a Cloud Firestore collection (for example, users).

This extension allows you to write a document to your specified Cloud Firestore collection using a Callable HTTP function. If you add a string to a specified field in the document within that collection, this extension:

- Gets the type of event sent to the callable function and the string value of the specified field.
- Writes the document to the specified collection if the value of the specified field is unique.
- Creates or deletes a document with that value as it's key on a separate specified aux collection

#### How to use

This extension works using a callable function to write documents to the collection, instead of writing directly from the client app. The goal of this extension is to maintain documents on an aux collection, each document having the unique field value as the key, and thus checking for uniqueness of these documents using a transaction on the server.

In the following example, we'll be using _users_ and _username_ as the collection and field respectively, but it could be any field name and collection name.

```js
const data = {
  change: "CREATE",
  collection: "users",
  fieldName: "username",
  document: {
    id,
    username
  }
};

const callable = firebase.functions().httpsCallable("ext-field-uniqueness-http-fieldUniqueness");
callable(data)
.then((result) => {
  // User created successfully
})
.catch((error) => {
  // Username already taken
});
```

You should also indicate in your security rules that the collection, in this example called _users_, should have `allow write: if false;` as a security rule, since we don't want to allow the client to write to this collection, only the HTTP callable function should be writing to it.

#### Additional setup

Before installing this extension, make sure that you've [set up a Cloud Firestore database](https://firebase.google.com/docs/firestore/quickstart) in your Firebase project.

#### Billing
To install an extension, your project must be on the [Blaze (pay as you go) plan](https://firebase.google.com/pricing)

- You will be charged a small amount (typically around $0.01/month) for the Firebase resources required by this extension (even if it is not used).
- This extension uses other Firebase and Google Cloud Platform services, which have associated charges if you exceed the service’s no-cost tier:
  - Cloud Firestore
  - Cloud Functions (Node.js 10+ runtime. [See FAQs](https://firebase.google.com/support/faq#extensions-pricing))

**Configuration Parameters:**

* Hash field: The value of the unique field will be used as an id for a new document in Firestore. Would you like to hash the value of the field due to constraints on document IDs?

* Require auth: Would you like to check for user authentication inside the Cloud Function?

* Cloud Functions location: Where do you want to deploy the functions created for this extension? You usually want a location close to your database. For help selecting a location, refer to the [location selection guide](https://firebase.google.com/docs/functions/locations).

**Cloud Functions:**

* **fieldUniqueness:** Listens for writes of a specified field to your specified Cloud Firestore collection, then writes a new document using that field's value as the key to a specified aux collection that will serve for checking uniqueness.

* **fieldUniquenessBackfill:** Searches your specified Cloud Firestore collection for existing documents, then writes the new documents in the aux collection.


**Access Required**:

This extension will operate with the following project IAM roles:

* datastore.user (Reason: Allows the extension to write translated strings to Cloud Firestore.)