require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Naileon Karte API v2.0' });
});

// カルテ新規作成・更新
app.post('/api/karte', async (req, res) => {
  const karteData = req.body;
  
  try {
    console.log('カルテ作成/更新:', karteData.status);
    
    // まず既存レコードを確認
    const searchResponse = await axios.get(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/カルテ`,
      {
        params: {
          filterByFormula: `{LINE User ID}='${karteData.userId}'`,
          maxRecords: 1
        },
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`
        }
      }
    );
    
    const fields = {
      'LINE User ID': karteData.userId,
      'ステータス': karteData.status || 'light',
      '登録日時': karteData.timestamp,
      '最終更新日時': new Date().toISOString(),
      
      // ライトカルテ情報
      '都道府県': karteData.prefecture || '',
      '市区町村': karteData.city || '',
      'メニュー対象': karteData.menuTarget || '',
      'メニューカテゴリ': karteData.menuCategory || '',
      'メニュー詳細': karteData.menuDetail || '',
      'オフ有無': karteData.hasOff || '',
      '参考料金': karteData.estimatedPrice || 0,
      '利用シーン': karteData.scene || '',
      '施設名': karteData.hospitalName || '',
      '許可状況': karteData.permission || '',
      
      // ミドルカルテ情報
      '第1希望日時': karteData.preferredDate1 || '',
      '第2希望日時': karteData.preferredDate2 || '',
      '第3希望日時': karteData.preferredDate3 || '',
      
      // フルカルテ情報
      '本名': karteData.fullName || '',
      '年齢・年代': karteData.age || '',
      '緊急連絡先': karteData.emergencyContact || '',
      'キャンセルポリシー同意': karteData.cancelPolicy || false,
      '病室番号': karteData.roomNumber || '',
      '訪問時の注意事項': karteData.visitingInstructions || ''
    };
    
    let airtableResponse;
    
    if (searchResponse.data.records.length > 0) {
      // 既存レコードを更新
      const recordId = searchResponse.data.records[0].id;
      airtableResponse = await axios.patch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/カルテ/${recordId}`,
        { fields },
        {
          headers: {
            'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('Airtable更新成功:', recordId);
    } else {
      // 新規レコード作成
      airtableResponse = await axios.post(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/カルテ`,
        { fields },
        {
          headers: {
            'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('Airtable保存成功:', airtableResponse.data.id);
    }
    
    // LINE通知（ステータスに応じて）
    if (process.env.LINE_CHANNEL_ACCESS_TOKEN && karteData.status) {
      try {
        let message = '';
        
        if (karteData.status === 'light') {
          message = `✨ カルテ（基本情報）を受付けました!\n\n参考料金: ¥${(karteData.estimatedPrice || 0).toLocaleString()}\n\n次のステップで希望日時をお聞かせください。`;
        } else if (karteData.status === 'middle') {
          message = `📅 希望日時を受付けました!\n\nネイリストを調整中です。\n通常1-2時間以内にご連絡いたします 💅`;
        } else if (karteData.status === 'full') {
          message = `🎉 カルテ登録が完了しました!\n\nネイリストとの調整を進めております。\n確定次第ご連絡いたします 💅`;
        }
        
        if (message) {
          await axios.post(
            'https://api.line.me/v2/bot/message/push',
            {
              to: karteData.userId,
              messages: [{ type: 'text', text: message }]
            },
            {
              headers: {
                'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log('LINE通知送信成功:', karteData.status);
        }
      } catch (lineError) {
        console.log('LINE通知エラー(無視):', lineError.response?.data || lineError.message);
      }
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

// カルテ取得
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
        status: fields['ステータス'],
        
        // ライトカルテ
        prefecture: fields['都道府県'],
        city: fields['市区町村'],
        menuTarget: fields['メニュー対象'],
        menuCategory: fields['メニューカテゴリ'],
        menuDetail: fields['メニュー詳細'],
        hasOff: fields['オフ有無'],
        estimatedPrice: fields['参考料金'],
        scene: fields['利用シーン'],
        hospitalName: fields['施設名'],
        permission: fields['許可状況'],
        
        // ミドルカルテ
        preferredDate1: fields['第1希望日時'],
        preferredDate2: fields['第2希望日時'],
        preferredDate3: fields['第3希望日時'],
        
        // フルカルテ
        fullName: fields['本名'],
        age: fields['年齢・年代'],
        emergencyContact: fields['緊急連絡先'],
        cancelPolicy: fields['キャンセルポリシー同意'],
        roomNumber: fields['病室番号'],
        visitingInstructions: fields['訪問時の注意事項'],
        
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

// カルテ更新（PUT）
app.put('/api/karte/:userId', async (req, res) => {
  const { userId } = req.params;
  const karteData = req.body;
  
  try {
    console.log('カルテ更新 (PUT):', userId);
    
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
      
      const fields = {
        'ステータス': karteData.status || 'full',
        '最終更新日時': new Date().toISOString(),
        
        '都道府県': karteData.prefecture || '',
        '市区町村': karteData.city || '',
        'メニュー対象': karteData.menuTarget || '',
        'メニューカテゴリ': karteData.menuCategory || '',
        'メニュー詳細': karteData.menuDetail || '',
        'オフ有無': karteData.hasOff || '',
        '参考料金': karteData.estimatedPrice || 0,
        '利用シーン': karteData.scene || '',
        '施設名': karteData.hospitalName || '',
        '許可状況': karteData.permission || '',
        
        '第1希望日時': karteData.preferredDate1 || '',
        '第2希望日時': karteData.preferredDate2 || '',
        '第3希望日時': karteData.preferredDate3 || '',
        
        '本名': karteData.fullName || '',
        '年齢・年代': karteData.age || '',
        '緊急連絡先': karteData.emergencyContact || '',
        'キャンセルポリシー同意': karteData.cancelPolicy || false,
        '病室番号': karteData.roomNumber || '',
        '訪問時の注意事項': karteData.visitingInstructions || ''
      };
      
      await axios.patch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/カルテ/${recordId}`,
        { fields },
        {
          headers: {
            'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Airtable更新成功');
      
      // LINE通知
      if (process.env.LINE_CHANNEL_ACCESS_TOKEN && karteData.status === 'full') {
        try {
          await axios.post(
            'https://api.line.me/v2/bot/message/push',
            {
              to: userId,
              messages: [{
                type: 'text',
                text: '🎉 カルテ登録が完了しました!\n\nネイリストとの調整を進めております。\n確定次第ご連絡いたします 💅'
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
        } catch (lineError) {
          console.log('LINE通知エラー(無視):', lineError.response?.data || lineError.message);
        }
      }
      
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
