import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as tf from '@tensorflow/tfjs';
import './App.css';

// --- DATA SOURCES ---

// 1. ADEME Category Baselines (kg CO2e per kg of product)
// This represents the AVERAGE emission factor for a product category.
const ademeCategoryData = {
  electronics: { baselineFactor: 15.5, name: 'Electronics' },
  small_electronics: { baselineFactor: 25.0, name: 'Small Electronics' },
  textiles: { baselineFactor: 12.0, name: 'Textiles' },
  plastic: { baselineFactor: 2.3, name: 'Plastics' },
  aluminum: { baselineFactor: 8.2, name: 'Aluminum' },
};

// 2. Product-Specific Mapping
// Each item has its own specific emission factor, representing a specific "alternative".
// This allows us to compare it against the category baseline.
const itemMappings = {
  laptop: {
    ademeCategory: 'electronics',
    averageWeightKg: 2.0,
    specificEmissionFactor: 18.0, // This is a "performance" laptop, higher than the baseline of 15.5
    recommendation: 'This appears to be a standard or performance laptop. Models using recycled materials can have a footprint up to 20% lower.',
  },
  smartphone: {
    ademeCategory: 'small_electronics',
    averageWeightKg: 0.2,
    specificEmissionFactor: 25.0, // An average smartphone
    recommendation: 'The biggest impact comes from frequent replacement. Making your phone last an extra year significantly reduces its lifetime footprint.',
  },
  television: {
    ademeCategory: 'electronics',
    averageWeightKg: 15.0,
    specificEmissionFactor: 15.5, // An average TV
    recommendation: "Look for an 'Energy Star' rating on your next purchase to reduce usage emissions, which often outweigh manufacturing.",
  },
  'water bottle': {
    ademeCategory: 'plastic',
    averageWeightKg: 0.05,
    specificEmissionFactor: 2.1, // Slightly better than average plastic
    recommendation: 'This bottle has a relatively low manufacturing footprint. The key is to reuse it instead of buying new ones.',
  },
  't-shirt': {
    ademeCategory: 'textiles',
    averageWeightKg: 0.25,
    specificEmissionFactor: 7.5, // Made of organic cotton, better than the baseline of 12.0
    recommendation: 'This item has a lower-than-average footprint for textiles, likely due to materials like organic cotton. Well done.',
  },
  can: {
    ademeCategory: 'aluminum',
    averageWeightKg: 0.015,
    specificEmissionFactor: 8.2, // A standard aluminum can
    recommendation: 'The impact is in the metal production. Aluminum is infinitely recyclable, so always ensure this ends up in the recycling bin.',
  },
};

const averageEuropeanHouseholdCO2 = 8000;

// --- APPLICATION COMPONENT ---

const App = () => {
  const [model, setModel] = useState(null);
  const [scannedItems, setScannedItems] = useState([]);
  const [lastScanned, setLastScanned] = useState(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    const loadApp = async () => {
      await tf.ready();
      const mobilenetModel = await mobilenet.load();
      setModel(mobilenetModel);
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) videoRef.current.srcObject = stream;
      }
    };
    loadApp();
  }, []);

  const getRelativeImpact = (itemFactor, baselineFactor) => {
    const ratio = itemFactor / baselineFactor;
    if (ratio < 0.85) return { text: 'Low', class: 'low' }; // Significantly better than average
    if (ratio > 1.15) return { text: 'High', class: 'high' }; // Significantly worse than average
    return { text: 'Average', class: 'medium' }; // On par with the average
  };

  const handleIdentify = useCallback(async () => {
    if (model && videoRef.current) {
      setIsIdentifying(true);
      const predictions = await model.classify(videoRef.current);
      setIsIdentifying(false);

      if (predictions && predictions.length > 0) {
        const identifiedClass = predictions[0].className.split(', ')[0].toLowerCase();
        const mapping = itemMappings[identifiedClass];

        let result;
        if (mapping) {
          const categoryInfo = ademeCategoryData[mapping.ademeCategory];
          const manufacturingCO2 = mapping.averageWeightKg * mapping.specificEmissionFactor;
          const relativeImpact = getRelativeImpact(mapping.specificEmissionFactor, categoryInfo.baselineFactor);

          result = {
            name: identifiedClass,
            co2: parseFloat(manufacturingCO2.toFixed(2)),
            recommendation: mapping.recommendation,
            relativeImpact: relativeImpact.text,
            relativeImpactClass: relativeImpact.class,
            categoryName: categoryInfo.name,
          };
        } else {
          result = {
            name: `Unknown: ${identifiedClass}`,
            co2: 0,
            recommendation: 'No emissions data available for this item.',
            relativeImpact: 'N/A',
            relativeImpactClass: 'na',
            categoryName: 'Unknown',
          };
        }
        setLastScanned(result);
        if (result.co2 > 0) {
          setScannedItems(prevItems => [...prevItems, result]);
        }
      }
    }
  }, [model]);

  const totalCO2 = scannedItems.reduce((acc, item) => acc + item.co2, 0);
  const co2Percentage = ((totalCO2 / averageEuropeanHouseholdCO2) * 100).toFixed(2);

  return (
    <div className="container">
      <header className="header">
        <h1>Household Carbon Calculator</h1>
        <p className="header-subtitle">Comparing products against their category average</p>
      </header>

      <main className="main-content">
        <div className="camera-container">
          <video ref={videoRef} autoPlay playsInline muted className="camera-feed" />
        </div>

        <div className="capture-section">
          <button onClick={handleIdentify} className="capture-button" disabled={!model || isIdentifying}>
            {isIdentifying ? 'Identifying...' : (model ? 'Assess Item Impact' : 'Loading Model...')}
          </button>
        </div>

        {lastScanned && (
          <div className="results-card">
            <h2 className="results-title">Impact Assessment</h2>
            <p className="item-name">{lastScanned.name}</p>
            <p>Category: <strong>{lastScanned.categoryName}</strong></p>
            <p>Manufacturing Footprint: <strong>{lastScanned.co2} kg CO₂e</strong></p>
            <div className="relative-impact">
              <p>Relative Impact:</p>
              <span className={`category-badge ${lastScanned.relativeImpactClass}`}>
                {lastScanned.relativeImpact}
              </span>
            </div>
            <div className="recommendation">
              <h3>Insight & Recommendation:</h3>
              <p>{lastScanned.recommendation}</p>
            </div>
          </div>
        )}

        <div className="summary-card">
          <h2 className="summary-title">Session Summary</h2>
          <p>Total Items Scanned: {scannedItems.length}</p>
          <div className="co2-total">
            <p className="co2-value">{totalCO2.toFixed(2)} kg</p>
            <p className="co2-label">Total Manufacturing CO₂e</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
