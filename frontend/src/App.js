import React, { useState } from "react";
import axios from 'axios';

const API_URL = "https://ai-summarizer-backend-c8m2.onrender.com";

function App() {
  const [text, setText] = useState("");
  const [summary, setSummary] = useState('');
  const [file, setFile] = useState(null);
  const [youtubeURL, setYoutubeURL] = useState("");
  const [mode, setMode] = useState('text');
  const [loading, setLoading] = useState(false);

  const handleSummarize = async () => {
    setLoading(true);
    setSummary("");
    try {
      let res;
      if (mode === "text") {
        if (!text.trim()) return alert("Please enter some text");
        res = await axios.post(`${API_URL}/summarize/text`, { text });
      } else if (mode === "pdf") {
        if (!file) return alert("Please upload a PDF file");
        const formData = new FormData();
        formData.append("file", file);
        res = await axios.post(`${API_URL}/summarize/pdf`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
      } else if (mode === "youtube") {
        if (!youtubeURL.trim()) return alert("Please enter a YouTube URL");
        res = await axios.post(`${API_URL}/summarize/youtube`, { url: youtubeURL });
      }
      setSummary(res.data.summary);
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
    setLoading(false);
  };

  return (
    <div className="App">
      <h1>AI Summarizer (Text, PDF and YouTube)</h1>
      <div className="mode-buttons">
        <button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}>
          Text
        </button>
        <button className={mode === "pdf" ? "active" : ""} onClick={() => setMode("pdf")}>
          PDF
        </button>
        <button className={mode === "youtube" ? "active" : ""} onClick={() => setMode("youtube")}>
          YouTube
        </button>
      </div>

      {mode === "text" && (
        <textarea
          placeholder="Paste your text here...."
          rows="10"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {mode === "pdf" && (
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files[0])}
        />
      )}
      {mode === "youtube" && (
        <input
          type="text"
          placeholder="Paste your YouTube video URL here..."
          value={youtubeURL}
          onChange={(e) => setYoutubeURL(e.target.value)}
        />
      )}

      <button onClick={handleSummarize} disabled={loading}>
        {loading ? "Summarizing..." : "Summarize"}
      </button>

      {summary && (
        <div className="Summary">
          <h2>Summary</h2>
          <p>{summary}</p>
        </div>
      )}
    </div>
  );
}

export default App;
