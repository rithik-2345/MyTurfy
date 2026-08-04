const { MongoClient } = require("mongodb");

const uri =
"mongodb+srv://joshirithikmrunal_db_user:x1kGrMHtKG66v5Fi@myturfy.p510ddd.mongodb.net/?retryWrites=true&w=majority&appName=myTurfy";

const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        console.log("✅ Connected");
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

run();