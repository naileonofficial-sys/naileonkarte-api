require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Naileon Karte API' });
});

app.post('/api/karte', async (req, res) => {
  const karteData = req.body;
  
  try {
    console.log('カルテ作成:', karteData);
    
    const airtableResponse = await axios.post(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/カルテ`,
      {
        fields: {
          'LINE User ID': karteData.userId,
          '利用シーン': karteData.scene || '',
          '施設名': karteData.hospitalName || '',
          '許可状況': karteData.permission || '',
          '都道府県': karteData.prefecture || '',
          '氏名': karteData.name || '',
          '電話番号': karteData.phone || '',
          '登録日時': karteData.timestamp,
          '最終更新日時': new Date().toISOString(),
          'ステータス': '新規'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Airtable保存成功:', airtableResponse.data.id);
    
    if (process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      await axios.post(
        'https://api.line.me/v2/bot/message/push',
        {
          to: karteData.userId,
          messages: [{
            type: 'text',
            text: '✨ カルテのご登録ありがとうございました!\n\nご希望に合うネイリストをマッチング中です。\n通常1-2時間以内にご連絡いたします 💅'
          }]
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('LINE通知送信成功');
    }
    
    res.json({ 
      success: true, 
      id: airtableResponse.data.id 
    });
    
  } catch (error) {
    console.error('エラー:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.response?.data || error.message
    });
  }
});

app.get('/api/karte/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    console.log('カルテ取得:', userId);
    
    const response = await axios.get(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/カルテ`,
      {
        params: {
          filterByFormula: `{LINE User ID}='${userId}'`,
          maxRecords: 1,
          sort: [{ field: '最終更新日時', direction: 'desc' }]
        },
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`
        }
      }
    );
    
    if (response.data.records.length > 0) {
      const record = response.data.records[0];
      const fields = record.fields;
      
      res.json({
        userId: fields['LINE User ID'],
        scene: fields['利用シーン'],
        hospitalName: fields['施設名'],
        permission: fields['許可状況'],
        prefecture: fields['都道府県'],
        name: fields['氏名'],
        phone: fields['電話番号'],
        timestamp: fields['登録日時'],
        updatedAt: fields['最終更新日時'],
        airtableId: record.id
      });
    } else {
      res.status(404).json({ error: 'Karte not found' });
    }
  } catch (error) {
    console.error('エラー:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.response?.data || error.message  
    });
  }
});

app.put('/api/karte/:userId', async (req, res) => {
  const { userId } = req.params;
  const karteData = req.body;
  
  try {
    console.log('カルテ更新:', userId);
    
    const searchResponse = await axios.get(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/カルテ`,
      {
        params: {
          filterByFormula: `{LINE User ID}='${userId}'`,
          maxRecords: 1
        },
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`
        }
      }
    );
    
    if (searchResponse.data.records.length > 0) {
      const recordId = searchResponse.data.records[0].id;
      
      await axios.patch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/カルテ/${recordId}`,
        {
          fields: {
            '利用シーン': karteData.scene || '',
            '施設名': karteData.hospitalName || '',
            '許可状況': karteData.permission || '',
            '都道府県': karteData.prefecture || '',
            '氏名': karteData.name || '',
            '電話番号': karteData.phone || '',
            '最終更新日時': new Date().toISOString()
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Airtable更新成功');
      
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Karte not found' });
    }
  } catch (error) {
    console.error('エラー:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.response?.data || error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});