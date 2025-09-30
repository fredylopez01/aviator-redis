try {
  rs.initiate({
    _id: "aviator-rs",
    members: [
      { _id: 0, host: "aviator-mongo1:27017", priority: 3 },
      { _id: 1, host: "aviator-mongo2:27017", priority: 2 },
      { _id: 2, host: "aviator-mongo3:27017", priority: 1 },
    ],
  });
} catch (e) {
  print("ReplicaSet already initiated or error: " + e);
}
