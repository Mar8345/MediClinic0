# API Contract Quick Reference

Use JSON request bodies and `Authorization: Bearer <token>` for private routes.

## Login

`POST /api/auth/login`

```json
{"email":"patient@clinic.local","password":"Patient@12345"}
```

Response:

```json
{"token":"...","user":{"id":1,"role":"PATIENT","email":"patient@clinic.local","name":"Ahmed Patient","phone":"01000000003"}}
```

## Patient booking

`POST http://localhost:4002/api/appointments/book`

```json
{"doctorId":1,"scheduledAt":"2026-09-24T10:30:00","reason":"Follow-up"}
```

## Doctor medical record

`POST http://localhost:4001/api/doctor/medical-records`

```json
{"patientId":1,"diagnosis":"Seasonal allergy","symptoms":"Sneezing","notes":"Follow up in 2 weeks."}
```

## Doctor prescription

`POST http://localhost:4001/api/doctor/prescriptions`

```json
{"patientId":1,"medication":"Medication name","dosage":"10 mg","instructions":"Take once daily after breakfast."}
```

## Secretary billing

`POST http://localhost:4003/api/secretary/billing`

```json
{"patientId":1,"appointmentId":1,"amountCents":50000,"paymentMethod":"Cash","status":"Paid"}
```

## Admin staff creation

`POST http://localhost:4004/api/admin/staff`

```json
{"role":"DOCTOR","email":"newdoctor@clinic.local","password":"StrongPass123","fullName":"Dr. New Doctor","phone":"01000000005","specialization":"Cardiology","workingHours":{"Sun":"09:00-15:00"},"feeCents":75000}
```
