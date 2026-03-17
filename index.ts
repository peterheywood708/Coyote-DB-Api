import express, { Request, Response } from "express";
import * as dotenv from "dotenv";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { Collection, Db, MongoClient, ObjectId } from "mongodb";
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
dotenv.config();

// Verifier that expects valid access tokens:
const verifier = CognitoJwtVerifier.create({
  userPoolId: `${process.env.COGNITO_USERPOOLID}`,
  tokenUse: "access",
  clientId: `${process.env.COGNITO_CLIENTID}`,
});

const port: string = process.env.PORT || "3001";
const client: MongoClient = new MongoClient(process.env.URI || "");

try {
  client.connect();
} catch (err) {
  console.warn(err);
}

app.post("/store", async (req: Request, res: Response) => {
  try {
    const token: string = req.header("authorization") || "";
    const payload = await verifier.verify(token);
    if (payload) {
      try {
        const db: Db = client.db("coyote");
        const col: Collection = db.collection("jobs");
        const transcriptDocument: Object = {
          file: req.body?.file,
          fileName: req.body?.fileName,
          status: req.body?.status,
          sqsId: null,
          userId: payload?.sub,
          date: Date.now(),
        };
        const p = await col.insertOne(transcriptDocument);
        res.send(p);
      } catch (err) {
        console.log(err);
        res.status(400).send(err);
      }
    } else {
      res.status(400).send("No authorisation token provided");
    }
  } catch (err) {
    console.warn(err);
    res.status(401).send(err);
  }
});

app.post("/delete", async (req: Request, res: Response) => {
  try {
    const token: string = req.header("authorization") || "";
    const payload = await verifier.verify(token);
    if (payload) {
      try {
        const db: Db = client.db("coyote");
        const col: Collection = db.collection("jobs");
        const p = await col.findOneAndDelete({
          _id: ObjectId.createFromHexString(req.body?.id),
          userId: payload?.sub,
        });

        // If the record is linked to a transcript, then delete this as well
        if (p?.transcriptId) {
          console.log(`Deleting ${p?.transcriptId}`);
          const transcriptCol: Collection = db.collection("transcripts");
          await transcriptCol.deleteOne({
            _id: ObjectId.createFromHexString(p?.transcriptId),
          });
        }

        // Send response back to frontend
        res.send(`${p?.file} deleted`);
      } catch (err) {
        console.log(err);
        res.status(400).send(err);
      }
    } else {
      res.status(400).send("No authorisation token provided");
    }
  } catch (err) {
    console.warn(err);
    res.status(401).send(err);
  }
});

app.post("/updatestatus", async (req: Request, res: Response) => {
  console.log(
    "New request received - Job ID: " +
      req.body?.jobId +
      ", Status: " +
      req.body?.status +
      ", Transcript ID: " +
      req.body?.transcriptId +
      ", Percentage: " +
      req.body?.percentage,
  );
  try {
    const db: Db = client.db("coyote");
    const col: Collection = db.collection("jobs");
    if (req.body?.status && req.body?.status) {
      const p = await col.updateOne(
        { _id: ObjectId.createFromHexString(req.body?.jobId) },
        {
          $set: {
            status: req.body?.status,
            transcriptId: req.body?.transcriptId,
            percentageComplete: req.body?.percentage,
          },
        },
      );
      res.send(p);
    } else {
      res.status(400).send("Ensure both job id and transcript id are provided");
    }
  } catch (err) {
    console.warn(err);
    res.status(400).send(err);
  }
});

app.post("/newtranscript", async (req: Request, res: Response) => {
  try {
    try {
      const db: Db = client.db("coyote");
      const col: Collection = db.collection("transcripts");
      const transcriptDocument: Object = {
        userId: req.body?.userId,
        jobId: req.body?.jobId,
        diarizations: req.body?.diarizations,
        created: Date.now(),
      };
      const p = await col.insertOne(transcriptDocument);
      res.send(p);
    } catch (err) {
      console.warn(err);
      res.status(400).send(err);
    }
  } catch (err) {
    console.warn(err);
    res.status(401).send(err);
  }
});

app.get("/list", async (req: Request, res: Response) => {
  try {
    const token: string = req.header("authorization") || "";
    const payload = await verifier.verify(token);
    if (payload) {
      try {
        const db: Db = client.db("coyote");
        const documents = await db
          .collection("jobs")
          .find({ userId: payload?.sub })
          .sort({ date: -1 })
          .toArray();
        res.send(documents);
      } catch (err) {
        console.warn(err);
        res.status(400).send(err);
      }
    }
  } catch (err) {
    console.warn(err);
    res.status(401).send(err);
  }
});

app.get("/getjob", async (req: Request, res: Response) => {
  try {
    const token: string = req.header("authorization") || "";
    if (token) {
      const payload = await verifier.verify(token);
      if (payload) {
        try {
          const db: Db = client.db("coyote");
          const document = await db.collection("jobs").findOne({
            _id: ObjectId.createFromHexString(req.header("id") || ""),
            userId: payload?.sub,
          });
          res.send(document);
        } catch (err) {
          console.warn(err);
          res.status(400).send(err);
        }
      }
    } else {
      res.status(401).send("No token passed");
    }
  } catch (err) {
    console.warn(err);
    res.status(401).send(err);
  }
});

app.get("/gettranscript", async (req: Request, res: Response) => {
  try {
    const token: string = req.header("authorization") || "";
    if (token) {
      const payload = await verifier.verify(token);
      if (payload) {
        try {
          const db: Db = await client.db("coyote");
          const document = await db.collection("transcripts").findOne({
            _id: ObjectId.createFromHexString(req.header("transcriptid") || ""),
            userId: payload?.username,
          });
          res.send(document);
        } catch (err) {
          console.warn(err);
          res.status(400).send(err);
        }
      }
    } else {
      res.status(401).send("No token passed");
    }
  } catch (err) {
    console.warn(err);
    res.status(401).send(err);
  }
});

app.get("/", (req: Request, res: Response) => {
  res.status(200).send("DB Api up and running.");
});

app.listen(port, () => {
  console.log(`Database API running on port ${port}`);
});
