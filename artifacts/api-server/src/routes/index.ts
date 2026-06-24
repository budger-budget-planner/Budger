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

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(categoriesRouter);
router.use(transactionsRouter);
router.use(householdsRouter);
router.use(invitesRouter);
router.use(notificationsRouter);
router.use(summaryRouter);
router.use(goalsRouter);
router.use(currenciesRouter);

export default router;
