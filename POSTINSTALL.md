### See it in action

You can test out this extension right away!

1.  Go to your [Cloud Firestore dashboard](https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data) in the Firebase console.

1.  If it doesn't exist already, create a collection called `${COLLECTION_PATH}`.

1.  Call the HTTP function passing a document with a field named `${FIELD_NAME}`, then make its value a string you want to ensure it's unique.

1.  In a few seconds, you'll see a new collection in Firestore called `${AUX_COLLECTION_PATH}` with a new document, that document will have as the key the value of the field `${FIELD_NAME}` of the  document you just created in `${COLLECTION_PATH}`.

1.  This newly created collection and documents will prevent the client creating documents with duplicate values for the specified field, since we're using transactions inside the function that check the uniqueness of the specified field.

1.  You also have the option to hash the `${FIELD_NAME}` selecting 'Yes' when prompted to hash the field upon installation, due to contraints on document IDs.


#### Using the extension

Call the function with a document with id _exampleId_ with the string _"bob1234"_ to the field `${FIELD_NAME}` in `${COLLECTION_PATH}` will result in the following document written in `${AUX_COLLECTION_PATH}`:

```js
{
  bob1234: {
    id: exampleId,
    ${FIELD_NAME}: bob1234,
  },
}
```

Now, if a client-side app wants to create / update a document with the string _"bob1234"_ to the field `${FIELD_NAME}` in `${COLLECTION_PATH}`, the function will return an error with a 'already-exists': code. For creating, updating and delting, the parameters are always `change` and `document`, the change should always be one between `CREATE`, `UPDATE`, and `DELETE`, and the document should always contain the id as a field.

### Monitoring

As a best practice, you can [monitor the activity](https://firebase.google.com/docs/extensions/manage-installed-extensions#monitor) of your installed extension, including checks on its health, usage, and logs.