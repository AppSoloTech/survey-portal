import express from "express";

import { anonymousSurveyAdminRouter } from "./anonymousSurveyRoutes.js";
import { mySurveysRouter } from "./mySurveysRoutes.js";
import { surveyAttemptRouter } from "./surveyAttemptRoutes.js";
import { surveyBuilderRouter } from "./surveyBuilderRoutes.js";
import { surveyReadRouter } from "./surveyReadRoutes.js";
import { surveyReportingRouter } from "./surveyReportingRoutes.js";

// The survey API is composed from focused routers: shared reads, admin
// builder writes, participant attempt routes, and admin reporting. Mount
// order keeps the original monolithic route matching behavior.
export const surveysRouter = express.Router();

surveysRouter.use(surveyReadRouter);
surveysRouter.use(anonymousSurveyAdminRouter);
surveysRouter.use(surveyBuilderRouter);
surveysRouter.use(surveyAttemptRouter);
surveysRouter.use(surveyReportingRouter);

export { mySurveysRouter };
