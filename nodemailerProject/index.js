const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const mysql = require("mysql");
const cors = require("cors");
const nodemailer = require('nodemailer');

// let x=0;
let standarBiaya = 0;
let emailSent = false;
let lastKwhValue = null;
let lastKwhWarning = null; // Tambahkan variabel untuk menyimpan nilai batas peringatan

// Konfigurasi koneksi database
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "password",
  database: "PZEEM004T"
});

// Menyambungkan ke database
connection.connect((err) => {
  if (err) {
    console.error("Koneksi database gagal:", err);
    return;
  }
  console.log("Terhubung ke database");
});

// Konfigurasi middleware
app.use(bodyParser.json());
app.use(cors());

// Mengirim data terkini melalui SSE
const sendSensorData = (res, sensorData) => {
  res.write(`data: ${JSON.stringify(sensorData)}\n\n`);
};

// Menyimpan data pembacaan sensor ke database dan mengirimkan data terkini melalui SSE
app.post("/data", (req, res) => {
  const { tegangan, arus, daya, kwh, pembayaran } = req.body;

  // Menyimpan data ke dalam tabel
  const query = "INSERT INTO PZEEM_VALUE (tegangan, arus, daya, kwh, pembayaran) VALUES (?, ?, ?, ?, ?)";
  const values = [tegangan, arus, daya, kwh, pembayaran];

  connection.query(query, values, (error, results) => {
    if (error) {
      console.error("Gagal menyimpan data:", error);
      res.status(500).json({ error: "Gagal menyimpan data" });
    } else {
      console.log("Data berhasil disimpan");
      console.log([pembayaran]);
      res.status(200).json({ message: "Data berhasil disimpan" });

      // Mengambil data terakhir dari tabel setelah penyimpanan berhasil
      const getLastSensorDataQuery = "SELECT * FROM PZEEM_VALUE ORDER BY id DESC LIMIT 1";
      connection.query(getLastSensorDataQuery, (err, result) => {
        if (err) {
          console.error("Gagal mengambil data terakhir:", err);
          return;
        }
        if (result.length > 0) {
          const data = result[0];
          const sensorData = {
            tegangan: data.tegangan,
            arus: data.arus,
            daya: data.daya,
            kwh: data.kwh,
            pembayaran: data.pembayaran
          };

          // Mengirim data terkini melalui SSE
          sendSensorData(res, sensorData);

          const getLastKwhWarningQuery = "SELECT stdrKWH FROM prngtandaya ORDER BY id DESC LIMIT 1";
          connection.query(getLastKwhWarningQuery, (err, result) => {
            if (err) {
              console.error("Gagal mengambil data terakhir:", err);
              return;
            }

            if (result.length > 0) {
              lastKwhWarning = result[0].stdrKWH; // Perbarui nilai batas peringatan dari database

              console.log(data.kwh);
        
              // Memeriksa apakah nilai KWH melebihi atau sama dengan standar peringatan
              if (data.kwh === lastKwhWarning && data.kwh !== lastKwhValue && !emailSent) {
                const recipient = 'arara21699@gmail.com'; // Ganti dengan alamat email penerima peringatan
                const subject = 'Peringatan Penggunaan KWH'; // Subjek email peringatan
                const message = `Nilai KWH telah mencapai batas peringatan: ${lastKwhWarning} KWH`; // Isi pesan peringatan
                sendEmail(recipient, subject, message); // Panggil fungsi untuk mengirimkan email peringatan
        
                emailSent = true;
              }
            } else {
              // Reset variabel lastKwhValue dan emailSent jika data tidak ditemukan
              lastKwhValue = null;
              emailSent = false;
            }
          });

        }
      });
    }
  });
});


// Mengambil data pembacaan sensor terakhir dari database
app.get("/data", (req, res) => {
  // Mengambil data terakhir dari tabel sensor_data
  const query = "SELECT * FROM PZEEM_VALUE ORDER BY id DESC LIMIT 1";

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Gagal mengambil data:", error);
      res.status(500).json({ error: "Gagal mengambil data" });
    } else {
      if (results.length > 0) {
        const data = results[0];
        const sensorData = {
          tegangan: data.tegangan,
          arus: data.arus,
          daya: data.daya,
          kwh: data.kwh,
          pembayaran: data.pembayaran
        };
        res.status(200).json(sensorData);
      } else {
        res.status(404).json({ error: "Data tidak ditemukan" });
      }
    }
  });
});

// Mengirimkan data pembacaan sensor secara periodik melalui SSE
app.get("/data-stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Mengirim data terkini saat koneksi SSE terbentuk
  const getLastSensorDataQuery = "SELECT * FROM PZEEM_VALUE ORDER BY id DESC LIMIT 1";
  connection.query(getLastSensorDataQuery, (err, result) => {
    if (err) {
      console.error("Gagal mengambil data terakhir:", err);
      return;
    }

    if (result.length > 0) {
      const data = result[0];
      const sensorData = {
        tegangan: data.tegangan,
        arus: data.arus,
        daya: data.daya,
        kwh: data.kwh,
        pembayaran: data.pembayaran
    };

      // Mengirim data terkini saat koneksi SSE terbentuk
      sendSensorData(res, sensorData);
    }
  });

  // Mengirim data terkini secara periodik melalui SSE
  const sendSensorDataPeriodically = () => {
    const getLastSensorDataQuery = "SELECT * FROM PZEEM_VALUE ORDER BY id DESC LIMIT 1";
    connection.query(getLastSensorDataQuery, (err, result) => {
      if (err) {
        console.error("Gagal mengambil data terakhir:", err);
        return;
      }

      if (result.length > 0) {
        const data = result[0];
        const sensorData = {
          tegangan: data.tegangan,
          arus: data.arus,
          daya: data.daya,
          kwh: data.kwh,
          pembayaran: data.pembayaran
        };

        // Mengirim data terkini secara periodik melalui SSE
        sendSensorData(res, sensorData);
      }
    });
  };

  const intervalId = setInterval(sendSensorDataPeriodically, 1000);

  // Menghentikan pengiriman SSE saat koneksi ditutup
  res.on("close", () => {
    clearInterval(intervalId);
  });
});

app.post("/standar-biaya", (req, res) => {
  const { harga } = req.body;

  if (harga === undefined || isNaN(harga) || harga <= 0) {
    res.status(400).json({ error: "Nilai Tidak Valid Bosquu" });
    return;
  }

  // Query untuk menyimpan data ke tabel stndrBiaya
  const insertQuery = "INSERT INTO stdrBiaya (stdrHarga) VALUES (?)";

  connection.query(insertQuery, [harga], (error, results) => {
    if (error) {
      console.error("Gagal menyimpan data:", error);
      res.status(500).json({ error: "Gagal menyimpan data" });
    } else {
      console.log("Data berhasil disimpan ke tabel stndrBiaya");
      console.log([harga]);
      res.status(200).json({ message: "Nilai Standar Biaya Berhasil disimpan Om" });
    }
  });
});

const sendEmail = (recipient, subject, message) => {
  // Konfigurasi transporter untuk pengiriman email
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'c27772303@gmail.com', // Ganti dengan alamat email pengirim
      pass: 'cuvkiznpfivazkma' // Ganti dengan kata sandi email pengirim
    }
  });

  // Konfigurasi email yang akan dikirim
  const mailOptions = {
    from: 'c27772303@gmail.com', // Ganti dengan alamat email pengirim
    to: recipient, // Alamat email penerima peringatan
    subject: subject, // Subjek email peringatan
    text: message // Isi pesan peringatan
  };

  // Kirim email menggunakan transporter
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('Gagal mengirim email:', error);
    } else {
      console.log('Email terkirim:', info.response);
    }
  });
};


app.post("/peringatan-KWH",(req,res)=> {
  const {peringatanKwh} = req.body;

  if (peringatanKwh === undefined || isNaN(peringatanKwh) || peringatanKwh <= 0) {
    res.status(400).json({ error: "Nilai Tidak Valid Bosquu" });
    return;
  }
  const insertQuery = "INSERT INTO prngtandaya (stdrKWH) VALUES (?)";

  connection.query(insertQuery, [peringatanKwh], (error, results) => {
    if (error) {
      console.error("Gagal menyimpan data:", error);
      res.status(500).json({ error: "Gagal menyimpan data" });
    } else {
      console.log("Data berhasil disimpan ke tabel prngtanDaya");
      console.log([peringatanKwh]);
      res.status(200).json({ message: "Nilai Standar Biaya Berhasil disimpan Om" });
  
    }
  });

});


app.get("/kirim-esp", (req, res) => {
  const query ="SELECT * FROM stdrBiaya ORDER BY id DESC LIMIT 1";

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Gagal mengambil data:", error);
      res.status(500).json({ error: "Gagal mengambil data" });
    } else {
      if (results.length > 0) {
        const stdrHarga = results[0].stdrHarga;
        const nilai = Number(stdrHarga);
        // console.log(nilai);
        res.status(200).json(nilai);
      } else {
        res.status(404).json({ error: "Data tidak ditemukan" });
      }
    }
  });
});




// Menjalankan server
app.listen(3000, () => {
  console.log("Server berjalan di port 3000");
});
