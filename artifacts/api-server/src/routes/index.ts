import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import categoriesRouter from "./categories";
import transactionsRouter from "./transactions";
import householdsRouter from "./households";
import invitesRouter from "./invites";
import notificationsRouter from "./notifications";
import summaryRouter from "./summary";
import goalsRouter from "./goals";
import currenciesRouter from "./currencies";
import webhookRouter from "./webhook";
import merchantCategoriesRouter from "./merchant-categories";
import splitsRouter from "./splits";
import liveActivityRouter from "./live-activity";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(webhookRouter);
router.use(merchantCategoriesRouter);
router.use(categoriesRouter);
router.use(transactionsRouter);
router.use(splitsRouter);
router.use(householdsRouter);
router.use(invitesRouter);
router.use(notificationsRouter);
router.use(summaryRouter);
router.use(goalsRouter);
router.use(currenciesRouter);
router.use(liveActivityRouter);

export default router;
