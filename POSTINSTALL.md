### See it in action

You can test out this extension right away!

1.  Go to your [Cloud Firestore dashboard](https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data) in the Firebase console.

1.  Call the HTTP function passing an object with the properties described in the README. You need to specify the type of `change` you'd like to execute, the `collection` you wish to add the document to, the `fieldName` you want to ensure uniqueness, and the `document` itself.

1.  In a few seconds, you'll see a new collection in Firestore with a new document, that document will have as the key the value of the field of the document you sent to the function.

1.  This newly created collection and documents will prevent the client creating documents with duplicate values for the specified field, since we're using transactions inside the function that check the uniqueness of the specified field.

1.  You also have the option to hash the field selecting 'Yes' when prompted to hash the field upon installation, due to contraints on document IDs.


#### Using the extension

Call the function with the collection _users_ and fieldName _username_, with a document with id _exampleId_ with the string _"bob1234"_ as the value to the field _username_ will result in the following document written in the collection _users-username_:

```js
{
  bob1234: {
    id: exampleId,
    username: bob1234,
  },
}
```

If you opted in to hash the field, instead of _"bob1234"_, you'll see a hashed value as the document id.

Now, if a client-side app wants to create / update a document with the string _"bob1234"_ to the field _username_ in _users_, the function will return an error with a 'already-exists': code. For creating, updating and delting, the parameters are always `change`, `collection`, `fieldName` and `document`, the change should always be one between `CREATE`, `UPDATE`, and `DELETE`, `collection` and `fieldName` should always be valid Firestore strings since they'll be used as collection and field names respectively, and the document should always contain the id as a field.

### Monitoring

As a best practice, you can [monitor the activity](https://firebase.google.com/docs/extensions/manage-installed-extensions#monitor) of your installed extension, including checks on its health, usage, and logs.