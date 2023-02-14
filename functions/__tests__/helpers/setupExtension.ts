export default () => {
  process.env.BACKFILL_COLLECTION = 'users';
  process.env.BACKFILL_FIELD_NAME = 'username';
  process.env.HASH_FIELD = 'no';
  process.env.LOCATION = 'us-central1';
  process.env.REQUIRE_AUTH = 'yes';
};