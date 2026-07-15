import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import locationCsvUrl from '../../data/location.csv?url'

const ALL_REGIONS = '전체 지역'

interface ChargerProperties {
  시설명: string
  시도명: string
  시군구명: string
  소재지도로명주소: string
  소재지지번주소: string
  설치장소설명: string
  관리기관명: string
  관리기관전화번호: string
  [key: string]: string
}

interface ChargerFeature {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: ChargerProperties
}

interface ChargerFeatureCollection {
  type: 'FeatureCollection'
  crs: {
    type: 'name'
    properties: { name: 'EPSG:4326' }
  }
  features: ChargerFeature[]
}

function parseCsv(csv: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(value)
      value = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && csv[index + 1] === '\n') index += 1
      row.push(value)
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }

  if (value || row.length) {
    row.push(value)
    if (row.some((cell) => cell.trim())) rows.push(row)
  }
  return rows
}

function csvToGeoJson(csv: string): ChargerFeatureCollection {
  const rows = parseCsv(csv)
  const headers = (rows.shift() ?? []).map((header) => header.replace(/^\uFEFF/, '').trim())
  const latitudeIndex = headers.indexOf('위도')
  const longitudeIndex = headers.indexOf('경도')

  if (latitudeIndex < 0 || longitudeIndex < 0) {
    throw new Error('CSV에서 위도 또는 경도 열을 찾을 수 없습니다.')
  }

  const features = rows.flatMap<ChargerFeature>((values) => {
    const latitude = Number(values[latitudeIndex])
    const longitude = Number(values[longitudeIndex])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return []

    const properties = Object.fromEntries(
      headers.map((header, index) => [header, values[index]?.trim() ?? '']),
    ) as ChargerProperties

    return [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [longitude, latitude] },
      properties,
    }]
  })

  return {
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: 'EPSG:4326' } },
    features,
  }
}

function createPopup(properties: ChargerProperties) {
  const popup = document.createElement('div')
  popup.className = 'charger-popup'

  const title = document.createElement('strong')
  title.textContent = properties.시설명 || '전동휠체어 급속충전기'
  popup.appendChild(title)

  const address = document.createElement('p')
  address.textContent = properties.소재지도로명주소 || properties.소재지지번주소 || '주소 정보 없음'
  popup.appendChild(address)

  if (properties.설치장소설명) {
    const location = document.createElement('p')
    location.textContent = `설치 위치: ${properties.설치장소설명}`
    popup.appendChild(location)
  }

  if (properties.관리기관명 || properties.관리기관전화번호) {
    const manager = document.createElement('small')
    manager.textContent = [properties.관리기관명, properties.관리기관전화번호].filter(Boolean).join(' · ')
    popup.appendChild(manager)
  }
  return popup
}

export default function ChargingStationMapPage() {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerLayerRef = useRef<L.GeoJSON | null>(null)
  const [geoJson, setGeoJson] = useState<ChargerFeatureCollection | null>(null)
  const [selectedRegion, setSelectedRegion] = useState(ALL_REGIONS)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(locationCsvUrl)
      .then((response) => {
        if (!response.ok) throw new Error('위치 데이터 파일을 불러오지 못했습니다.')
        return response.text()
      })
      .then((csv) => {
        if (!cancelled) setGeoJson(csvToGeoJson(csv))
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '위치 데이터를 처리하지 못했습니다.')
      })
    return () => { cancelled = true }
  }, [])

  const regions = useMemo(() => {
    if (!geoJson) return []
    return [...new Set(geoJson.features.map((feature) => feature.properties.시도명).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'ko-KR'))
  }, [geoJson])

  const filteredGeoJson = useMemo<ChargerFeatureCollection | null>(() => {
    if (!geoJson) return null
    return {
      ...geoJson,
      features: selectedRegion === ALL_REGIONS
        ? geoJson.features
        : geoJson.features.filter((feature) => feature.properties.시도명 === selectedRegion),
    }
  }, [geoJson, selectedRegion])

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return
    const map = L.map(mapElementRef.current, { zoomControl: true }).setView([36.3, 127.8], 7)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !filteredGeoJson) return
    markerLayerRef.current?.removeFrom(map)

    const markerLayer = L.geoJSON(filteredGeoJson, {
      pointToLayer: (_feature, latLng) => L.circleMarker(latLng, {
        radius: 6,
        weight: 1.5,
        color: '#ffffff',
        fillColor: '#198754',
        fillOpacity: 0.88,
      }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(createPopup(feature.properties as ChargerProperties), { maxWidth: 320 })
      },
    }).addTo(map)

    markerLayerRef.current = markerLayer
    const bounds = markerLayer.getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 })
  }, [filteredGeoJson])

  return (
    <main className="charger-map-page">
      <aside className="charger-filter-panel">
        <p className="home-eyebrow">CHARGING MAP</p>
        <h1>급속충전기 위치</h1>
        <label htmlFor="region-select">지역 선택</label>
        <select id="region-select" value={selectedRegion} onChange={(event) => setSelectedRegion(event.target.value)}>
          <option>{ALL_REGIONS}</option>
          {regions.map((region) => <option key={region}>{region}</option>)}
        </select>
        <div className="charger-count" aria-live="polite">
          <strong>{filteredGeoJson?.features.length.toLocaleString('ko-KR') ?? '-'}</strong>
          <span>개의 충전기</span>
        </div>
        <p className="charger-help">지도 위의 초록색 위치를 선택하면 시설명과 주소를 확인할 수 있습니다.</p>
      </aside>
      <section className="charger-map-area" aria-label="전국 전동휠체어 급속충전기 지도">
        {error && <div className="map-status map-error" role="alert">{error}</div>}
        {!geoJson && !error && <div className="map-status">위치 데이터를 불러오는 중...</div>}
        <div ref={mapElementRef} className="charger-map" />
      </section>
    </main>
  )
}
