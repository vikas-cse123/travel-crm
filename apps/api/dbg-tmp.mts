import { execFileSync } from 'node:child_process';
import { renderQuotationPdf } from './src/modules/quotations/pdf.service.js';
import { renderStylishQuotationPdf } from './src/modules/quotations/stylish-pdf.service.js';
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const input = {
  company: { name:'A', email:'', phone:null, website:null, address:null, primaryColor:'#2563eb', operatingSinceYear:null, tripsSold:null, tan:null, taxRegistrationNumber:null, logo:null },
  quotation: { quotationNumber:'QT-1', customerName:'Mira', customerEmail:null, customerPhone:'+91', destinationSummary:'Kerala', travelStartDate:null, travelEndDate:null, adults:2, childrenWithBed:0, childrenWithoutBed:0, infants:0, rooms:1, validUntil:null },
  version: {
    versionNumber:1, title:'T', introduction:null, currency:'INR', finalAmount:'100', notes:null,
    perAdultPrice:'50', perChildWithBedPrice:'0', perChildWithoutBedPrice:'0', perInfantPrice:'0',
    taxNote:null, initialPaymentAmount:'0', paymentLink:null, inclusionsHtml:null, exclusionsHtml:null,
    paymentPolicies:null, cancellationPolicies:null, bookingTerms:null, includeVisa:false,
    visaSectionTitle:null, visaAmount:'0', visaDestination:null, visaType:null, visaServiceCharge:'0', visaGstPercent:'0', visaVfsCharge:'0',
    flightDetails:null, hotels:[], itinerary:[], services:[], inclusions:[], exclusions:[], terms:[],
    sightseeingDetails: { include:true, days:[{ dayNumber:1, title:'Arrival Day Reorder', city:'KL', meals:{breakfast:false,lunch:false,dinner:false}, activities:[{ name:'City Drive', description:'<p>Panoramic drive.</p>' }] }] },
  },
  images: { cover: PNG_1PX },
} as never;
for (const [n, pdf] of [['classic', await renderQuotationPdf(input)], ['stylish', await renderStylishQuotationPdf(input)]] as const) {
  const t = execFileSync('pdftotext',['-layout','-','-'],{input:pdf}).toString().toLowerCase();
  console.log(n, '| tour-itin:', t.includes('tour itinerary'), '| daywise:', t.includes('day wise'), '| marker:', t.includes('arrival day reorder'), '| drive:', t.includes('panoramic drive'));
}
