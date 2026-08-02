'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import type { Map as LeafletMap, LayerGroup } from 'leaflet'
import type { CrmStage } from '@/lib/crm/types'

// The map view.
//
// Sonia covers Barcelona on foot — her other job already has her moving between
// shops all day — so she will knock on a door far more often than she will
// dial. A list sorted by "next call" answers the wrong question for that. This
// answers the right one: what is around me, right now.
//
// Deliberately not a mapping platform. No API key, no billing account, no SDK
// that wants an account manager: Leaflet over CARTO's light basemap, loaded
// only when this view is opened.

export interface MapPin {
  id: string
  name: string
  lat: number
  lon: number
  stage: CrmStage
  zone: string | null
  address: string | null
  phone: string | null
  telHref: string | null
  specialtyLabel: string
  referral: string | null
}

// Pins carry the stage as colour, so a district reads as a state of play rather
// than as a pile of dots: untouched, in progress, won, lost.
const STAGE_COLOR: Record<CrmStage, string> = {
  new: '#5F6B66',
  attempting: '#8C540A',
  contacted: '#3E7B73',
  interested: '#3E7B73',
  meeting: '#183C37',
  won: '#155E4C',
  lost: '#9B2C26',
}

export function ProspectMap({
  pins,
  labels,
}: {
  pins: MapPin[]
  labels: {
    openRecord: string
    directions: string
    nearMe: string
    locating: string
    noPosition: string
  }
}) {
  const holder = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const meLayer = useRef<LayerGroup | null>(null)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!holder.current || map.current) return
    let cancelled = false

    // Leaflet reaches for `window` at import time, so it cannot be bundled into
    // the server render.
    void (async () => {
      const L = (await import('leaflet')).default
      await import('leaflet.markercluster')
      if (cancelled || !holder.current) return

      const instance = L.map(holder.current, {
        // A finger is not a mouse: wheel zoom fights page scrolling on a phone.
        scrollWheelZoom: false,
        zoomControl: false,
      })
      map.current = instance

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(instance)

      // Bottom right: the top right is where the tab bar's shadow falls and the
      // bottom left is where the thumb already has a button.
      L.control.zoom({ position: 'bottomright' }).addTo(instance)
      meLayer.current = L.layerGroup().addTo(instance)

      // Three hundred and sixty six pins over one city is a stain, not a map.
      // Clustering turns it into a count per neighbourhood that opens as you
      // zoom, which is the only way the density of a district is readable.
      const cluster = (L as unknown as {
        markerClusterGroup: (o: Record<string, unknown>) => L.LayerGroup & {
          addLayer: (m: L.Layer) => void
          getBounds: () => L.LatLngBounds
        }
      }).markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: (c: { getChildCount: () => number }) => {
          const n = c.getChildCount()
          const size = n < 10 ? 34 : n < 50 ? 40 : 46
          return L.divIcon({
            className: '',
            html: `<span style="display:flex;align-items:center;justify-content:center;
                     width:${size}px;height:${size}px;border-radius:999px;background:#183C37;
                     color:#fff;font-weight:550;font-size:${n < 100 ? 14 : 13}px;
                     border:2px solid #fff;box-shadow:0 2px 8px rgba(17,24,39,.3)">${n}</span>`,
            iconSize: [size, size],
          })
        },
      })

      for (const pin of pins) {
        const marker = L.marker([pin.lat, pin.lon], {
          title: pin.name,
          icon: L.divIcon({
            className: '',
            html: `<span style="display:block;width:16px;height:16px;border-radius:999px;
                     background:${STAGE_COLOR[pin.stage]};border:2px solid #fff;
                     box-shadow:0 1px 4px rgba(17,24,39,.35)"></span>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
        })

        // Everything a rep decides from, in the popup: is it worth the walk,
        // and if so, call or go. No trip back to the list to find out.
        const dir = `https://maps.google.com/?q=${encodeURIComponent(
          `${pin.address ?? pin.name}, Barcelona`
        )}`
        marker.bindPopup(
          `<div style="min-width:206px">
             <p style="margin:0 0 2px;font-weight:550;font-size:15px;line-height:1.3">${escapeHtml(
               pin.name
             )}</p>
             <p style="margin:0 0 10px;color:#5F6B66;font-size:13px;line-height:1.4">${escapeHtml(
               [pin.specialtyLabel, pin.zone].filter(Boolean).join(' · ')
             )}${pin.address ? `<br>${escapeHtml(pin.address)}` : ''}</p>
             ${
               pin.referral
                 ? `<p style="margin:-6px 0 10px;display:inline-block;padding:2px 8px;
                      border-radius:999px;background:#EFF3F1;color:#183C37;font-size:12px;
                      font-weight:550">&#8599; ${escapeHtml(pin.referral)}</p>`
                 : ''
             }
             ${
               pin.telHref
                 ? `<a href="${pin.telHref}" style="display:flex;align-items:center;justify-content:center;
                      min-height:44px;border-radius:999px;background:#183C37;color:#fff;
                      font-weight:550;font-size:15px;text-decoration:none;margin-bottom:6px">${escapeHtml(
                        pin.phone ?? ''
                      )}</a>`
                 : ''
             }
             <div style="display:flex;gap:6px">
               <a href="/crm/prospetos/${pin.id}" style="flex:1;display:flex;align-items:center;
                  justify-content:center;min-height:40px;border-radius:999px;border:1px solid #D4D9D6;
                  color:#111827;font-size:13px;text-decoration:none">${escapeHtml(labels.openRecord)}</a>
               <a href="${dir}" target="_blank" rel="noreferrer" style="flex:1;display:flex;
                  align-items:center;justify-content:center;min-height:40px;border-radius:999px;
                  border:1px solid #D4D9D6;color:#111827;font-size:13px;text-decoration:none">${escapeHtml(
                    labels.directions
                  )}</a>
             </div>
           </div>`,
          { closeButton: true, maxWidth: 250, autoPanPadding: [16, 16] }
        )
        cluster.addLayer(marker)
      }

      instance.addLayer(cluster)
      if (pins.length) {
        instance.fitBounds(cluster.getBounds().pad(0.08))
      } else {
        instance.setView([41.3874, 2.1686], 12) // Barcelona
      }
    })()

    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
    }
  }, [pins, labels])

  async function locate() {
    if (!navigator.geolocation || !map.current) {
      setError(labels.noPosition)
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const L = (await import('leaflet')).default
        const { latitude, longitude } = pos.coords
        meLayer.current?.clearLayers()
        L.circleMarker([latitude, longitude], {
          radius: 8,
          color: '#fff',
          weight: 3,
          fillColor: '#183C37',
          fillOpacity: 1,
        }).addTo(meLayer.current!)
        map.current?.setView([latitude, longitude], 16)
        setLocating(false)
      },
      () => {
        setLocating(false)
        setError(labels.noPosition)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return (
    <div className="relative">
      {/* Full bleed on a phone, and tall: a map in a letterbox is a picture of
          a map. It stops above the tab bar so no pin sits under a thumb. */}
      <div
        ref={holder}
        className="-mx-4 h-[calc(100dvh-11rem)] min-h-[20rem] border-y border-line sm:mx-0 sm:rounded-card sm:border md:h-[calc(100dvh-15rem)]"
      />

      <button
        type="button"
        onClick={locate}
        className="absolute bottom-4 left-4 z-[400] inline-flex min-h-[2.75rem] items-center gap-2 rounded-pill border border-line-strong bg-surface px-4 text-base font-medium text-ink shadow-2"
      >
        {locating ? labels.locating : labels.nearMe}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-base text-warn">
          {error}
        </p>
      )}
    </div>
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
