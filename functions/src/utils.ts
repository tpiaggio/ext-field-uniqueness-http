export type Data = {
  change: string,
  collection: string,
  fieldName: string,
  document: {
    id: string,
    [fieldName: string]: string
  }
};
