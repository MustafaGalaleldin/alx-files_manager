#!/usr/bin/node
const { ObjectId } = require('mongodb');
const mime = require('mime-types');
const fs = require('fs');
const path = require('path');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

class FilesController {
  static async postUpload(req, res) {
    const { name, type, isPublic, data, parentId } = req.body;
    const { userId } = req;

    if (!name || !type || !data) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(userId) });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const newFile = {
      userId: ObjectId(userId),
      name,
      type,
      isPublic: isPublic || false,
      parentId: parentId ? ObjectId(parentId) : '0',
      localPath: null,
    };

    if (type !== 'folder') {
      const localPath = `/tmp/files_manager/${newFile.userId}-${Date.now()}-${name}`;
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, Buffer.from(data, 'base64'));
      newFile.localPath = localPath;
    }

    const result = await dbClient.db.collection('files').insertOne(newFile);
    return res.status(201).json({ id: result.insertedId, ...newFile });
  }

  static async getIndex(req, res) {
    const { userId } = req;
    const { parentId = '0', page = 0 } = req.query;

    const query = {
      userId: ObjectId(userId),
      parentId: parentId === '0' ? '0' : ObjectId(parentId),
    };

    const files = await dbClient.db
      .collection('files')
      .find(query)
      .skip(page * 20)
      .limit(20)
      .toArray();

    return res.status(200).json(files);
  }

  static async getShow(req, res) {
    const { userId } = req;
    const { id } = req.params;

    const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(id), userId: ObjectId(userId) });
    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json(file);
  }

  static async getFile(req, res) {
    const { id } = req.params;
    const { size } = req.query;
    const { userId } = req;

    const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(id) });
    if (!file || (file.isPublic === false && file.userId.toString() !== userId)) {
        return res.status(404).json({ error: 'Not found' });
    }

    if (file.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
    }

    const filePath = size ? `${file.localPath}_${size}` : file.localPath;

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Not found' });
    }

    const mimeType = mime.lookup(file.name);
    res.setHeader('Content-Type', mimeType);
    res.status(200).sendFile(filePath);
    }
}
