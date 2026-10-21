import { useEffect } from 'react'
import { videoInfo } from '../lib/video'

/** Lecteur vidéo en fenêtre modale (YouTube intégré ; lien externe sinon). */
export function VideoModal({ url, titre, onClose }: { url: string; titre?: string; onClose: () => void }) {
  const v = videoInfo(url)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={titre ?? 'Vidéo'}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="title">{titre ?? 'Vidéo'}</div>
          </div>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Fermer" style={{ fontSize: '1.3rem', color: 'var(--fg)' }}>
            ✕
          </button>
        </div>
        {v?.embed ? (
          <div className="video-frame">
            <iframe src={v.embed} title={titre ?? 'Vidéo'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
          </div>
        ) : (
          <div style={{ padding: 16 }}>
            <p className="muted">Cette vidéo n'est pas hébergée sur YouTube ; elle s'ouvrira dans un nouvel onglet.</p>
            <a className="btn btn-primary btn-block" href={url} target="_blank" rel="noreferrer">
              Ouvrir la vidéo
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export const IconPlay = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)
