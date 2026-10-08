import React, { useState, useEffect } from 'react';
import './ProgressOverlay.css';

const ProgressOverlay = ({ status, progress }) => {
  // État pour la progression animée
  const [animatedProgress, setAnimatedProgress] = useState(0);
  
  // Animation fluide de la progression
  useEffect(() => {
    if (!status) {
      setAnimatedProgress(0);
      return;
    }
    
    // Si la progression est 0, réinitialiser immédiatement
    if (progress === 0) {
      setAnimatedProgress(0);
      return;
    }
    
    // Modification importante ici : toujours mettre à jour la progression,
    // même si elle est inférieure à la progression actuelle
    // Cela permet de gérer les cas où la progression redémarre à 60%
    
    // Calculer l'incrément pour une animation fluide
    const diff = Math.abs(progress - animatedProgress);
    
    // Si la différence est très petite, mettre à jour directement
    if (diff < 0.5) {
      setAnimatedProgress(progress);
      return;
    }
    
    // Déterminer la durée en fonction de la différence
    const duration = Math.min(Math.max(diff * 20, 300), 1500);
    const step = diff / (duration / 20); // ~50 FPS
    
    let currentProgress = animatedProgress;
    const timer = setInterval(() => {
      // Si la nouvelle progression est supérieure, augmenter
      if (progress > currentProgress) {
        currentProgress += step;
        if (currentProgress >= progress) {
          clearInterval(timer);
          setAnimatedProgress(progress);
        } else {
          setAnimatedProgress(currentProgress);
        }
      } 
      // Si la nouvelle progression est inférieure, diminuer
      else if (progress < currentProgress) {
        currentProgress -= step;
        if (currentProgress <= progress) {
          clearInterval(timer);
          setAnimatedProgress(progress);
        } else {
          setAnimatedProgress(currentProgress);
        }
      }
      // Si égales, arrêter
      else {
        clearInterval(timer);
      }
    }, 20);
    
    return () => clearInterval(timer);
  }, [progress, status]);
  
  if (!status) return null;

  // Modifier la détection des messages de recherche d'adresse
  const isSearchingAddress = status.includes('Searching for custom address') || 
                            status.includes('Continuing custom address search') ||
                            status.includes('Recherche d\'adresse personnalisée') ||
                            status.includes('Recherche approfondie d\'adresse');
  
  return (
    <div className="progress-overlay">
      <div className="progress-content">
        <div className="progress-spinner"></div>
        <div className="progress-status">
          <p className="status-text">{status || 'Chargement...'}</p>
          {isSearchingAddress && (
            <div className="search-info">
              <p className="status-note">
                Analyse en cours de millions d'adresses potentielles. Cette opération peut prendre du temps...
              </p>
              <div className="search-timer">
                {/* Vous pourriez ajouter un compteur ici si vous le souhaitez */}
              </div>
            </div>
          )}
        </div>
        <div className="progress-bar">
          <div 
            className="progress-bar-fill" 
            style={{ 
              width: `${Math.min(Math.round(animatedProgress), 100)}%`,
              transition: 'width 0.3s ease-out'
            }}
          ></div>
        </div>
        <div className="progress-percentage">
          {Math.min(Math.round(animatedProgress), 100)}%
        </div>
      </div>
    </div>
  );
};

export default ProgressOverlay; 