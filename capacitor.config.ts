// Selected by cap:elder / cap:family; default is the elder application.
import elder from "./capacitor.elder.config";
import family from "./capacitor.family.config";

export default process.env.GRANNYTOOLS_APP === "family" ? family : elder;
