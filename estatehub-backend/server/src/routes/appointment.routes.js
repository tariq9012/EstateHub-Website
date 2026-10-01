// src/routes/appointment.routes.js

const express = require('express');
const appointmentController = require('../controllers/appointment.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateRequest = require('../middleware/validateRequest');
const {
  createAppointmentValidator,
  updateAppointmentStatusValidator,
} = require('../validators/appointment.validator');

const router = express.Router();

router.post(
  '/',
  authenticate,
  createAppointmentValidator,
  validateRequest,
  appointmentController.createAppointment
);
router.get('/me', authenticate, appointmentController.getMyAppointments);
router.get('/agent', authenticate, authorize('agent'), appointmentController.getAgentAppointments);
router.put(
  '/:id/status',
  authenticate,
  updateAppointmentStatusValidator,
  validateRequest,
  appointmentController.updateAppointmentStatus
);

module.exports = router;
