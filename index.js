const express = require("express");
const app = express();
const port = process.env.PORT || 9000;
console.log(port);
const cors = require("cors");
require("dotenv").config();

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.MONGO_DB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    // await client.connect();
    const database = client.db("resells-hub");
    const productCollection = database.collection("products");
    const orderCollection = database.collection("orders");

    app.get("/api/product", async (req, res) => {
      const { status, search, category, condition, sort, page, limit } =
        req.query;

      // নতুন params-এর কোনোটা আছে কিনা চেক — থাকলে "public listing mode"
      const isListingRequest =
        search !== undefined ||
        sort !== undefined ||
        page !== undefined ||
        limit !== undefined ||
        category !== undefined ||
        condition !== undefined;

      const query = {};
      if (status) query.status = status;
      if (search) query.title = { $regex: search, $options: "i" };
      if (category) query.category = category;
      if (condition) query.condition = condition;

      // পুরনো ব্যবহার — কোনো নতুন param নেই, ঠিক আগের মতোই raw array রিটার্ন করবে
      if (!isListingRequest) {
        const cursor = productCollection.find(query);
        const result = await cursor.toArray();
        return res.send(result);
      }

      // নতুন ব্যবহার — search/sort/pagination সহ object শেপে রিটার্ন করবে
      let sortOption = { _id: -1 }; // default: newest first
      if (sort === "price_asc") sortOption = { price: 1 };
      else if (sort === "price_desc") sortOption = { price: -1 };

      const pageNum = parseInt(page) || 1;
      const limitNum = limit !== undefined ? parseInt(limit) : 8;

      const totalCount = await productCollection.countDocuments(query);

      let cursor = productCollection.find(query).sort(sortOption);
      if (limitNum > 0) {
        const skip = (pageNum - 1) * limitNum;
        cursor = cursor.skip(skip).limit(limitNum);
      }

      const result = await cursor.toArray();

      res.send({
        products: result,
        totalCount,
        totalPages: limitNum > 0 ? Math.ceil(totalCount / limitNum) : 1,
        currentPage: pageNum,
      });
    });

    //get single api
    app.get("/api/product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result);
    });

    app.post("/api/product", async (req, res) => {
      const product = req.body;
      const result = await productCollection.insertOne(product);
      res.send(result);
    });

    // Get orders — seller বা buyer অনুযায়ী ফিল্টার
    app.get("/api/orders", async (req, res) => {
      const query = {};
      if (req.query.sellerId) {
        query["sellerInfo.userId"] = req.query.sellerId;
      }
      if (req.query.buyerId) {
        query["buyerInfo.userId"] = req.query.buyerId;
      }
      if (req.query.status) {
        query.orderStatus = req.query.status;
      }
      const cursor = orderCollection.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/api/orders", async (req, res) => {
      const order = req.body;
      order.orderStatus = order.orderStatus || "pending";
      order.paymentStatus = order.paymentStatus || "pending";
      order.createdAt = new Date();
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });

    // Update order status — Accept / Reject / Processing / Shipped / Delivered
    app.patch("/api/orders/:id", async (req, res) => {
      const id = req.params.id;
      const { orderStatus } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { orderStatus } };
      const result = await orderCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

//user : resells-hub
//password: yDheCeQv0X6R31YM
